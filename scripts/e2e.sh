#!/usr/bin/env bash
# End-to-end smoke probe — needs all services up.
#
# Prereqs (manual, see docs/runbook.md):
#   docker compose -f deploy/docker-compose.yml up -d postgres redis minio
#   cd xg-backend && ./gradlew :xg-app:bootRun --args='--spring.profiles.active=dev'   # 8080
#   cd xg-ai     && python -m app                                                       # 8001
#
# IMPORTANT: this script only proves the running services match the latest code
# if those services were restarted after the latest checkout. If a probe fails,
# the most common cause is "服务没重启了"。
#
# Exits 0 on success, prints a failure summary on first error.

set -euo pipefail

JAVA_BASE="${JAVA_BASE_URL:-http://localhost:8080}"
AI_BASE="${AI_BASE_URL:-http://localhost:8001}"
USERNAME="${E2E_USERNAME:-officer1}"
PASSWORD="${E2E_PASSWORD:-xg@123456}"
TENANT="${E2E_TENANT:-default}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
pass() { printf '\033[32m✓\033[0m %s\n' "$1"; }

# 1. Health checks -----------------------------------------------------
bold "[1/5] Health checks"
java_health=$(curl -fsS "$JAVA_BASE/actuator/health" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo FAIL)
[ "$java_health" = "UP" ] || fail "Java backend health: $java_health  (start ./gradlew :xg-app:bootRun)"
pass "Java backend UP"

ai_health=$(curl -fsS "$AI_BASE/health" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo FAIL)
[ "$ai_health" = "ok" ] || fail "AI sidecar health: $ai_health  (start cd xg-ai && python -m app)"
pass "AI sidecar UP"

# 2. Login -------------------------------------------------------------
bold "[2/5] Login as $USERNAME"
login_resp=$(curl -fsS -X POST "$JAVA_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -H "X-Tenant-Id: $TENANT" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT\"}")
TOKEN=$(echo "$login_resp" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])")
USER_ID=$(echo "$login_resp" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['user']['id'])")
ROLE=$(echo "$login_resp" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['user']['role_codes'][0])")
[ -n "$TOKEN" ] || fail "no token in login response: $login_resp"
pass "Login OK  (user_id=$USER_ID  role=$ROLE)"

H_AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-User-Id: $USER_ID" -H "X-Tenant-Id: $TENANT")

# 3. Positions list ----------------------------------------------------
bold "[3/5] List positions"
pos_total=$(curl -fsS "${H_AUTH[@]}" "$JAVA_BASE/api/v1/work-study/positions?page=1&size=1" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['total'])")
pass "positions total=$pos_total"

# 4. Applications list with include=position --------------------------
bold "[4/5] Applications list (include=position)"
apps_resp=$(curl -fsS "${H_AUTH[@]}" \
  "$JAVA_BASE/api/v1/work-study/applications?page=1&size=5&include=position")
has_summary=$(echo "$apps_resp" | python3 -c "
import json, sys
data = json.load(sys.stdin).get('data', {}).get('data', [])
# Jackson is configured to SNAKE_CASE in application.yml, so the field on the wire
# is position_summary (snake). Accept either form to avoid failing on a future
# casing change.
if not data:
    print('NO_DATA')
elif any((r or {}).get('position_summary') or (r or {}).get('positionSummary') for r in data):
    print('OK')
else:
    print('MISSING')
")
case "$has_summary" in
  OK)        pass "include=position works (positionSummary populated)" ;;
  NO_DATA)   pass "no applications yet (skipped include=position assertion)" ;;
  MISSING)   fail "include=position did not populate positionSummary  (Java backend not restarted after Z change?)" ;;
esac

# 5. AI sidecar direct tool exec --------------------------------------
bold "[5/5] AI direct tool: workstudy_dashboard_brief"
ai_resp=$(curl -fsS -X POST "$AI_BASE/api/v1/tools/workstudy_dashboard_brief/execute" \
  -H 'Content-Type: application/json' \
  -H "X-User-Id: $USER_ID" -H "X-Tenant-Id: $TENANT" -H "X-User-Role: $ROLE" \
  -d '{"args":{}}' 2>&1)
output=$(echo "$ai_resp" | python3 -c "
import json, sys
try:
    body = json.loads(sys.stdin.read())
    if 'output' in body and body['output']:
        print('OK:' + body['output'][:80].replace(chr(10), ' / '))
    elif 'detail' in body:
        print('NOT_FOUND:' + body['detail'])
    else:
        print('UNEXPECTED:' + str(body)[:120])
except Exception as e:
    print('PARSE_ERR:' + str(e))
")
case "$output" in
  OK:*)        pass "AI tool executed: ${output#OK:}…" ;;
  NOT_FOUND:*) fail "AI sidecar /tools endpoint missing — sidecar not restarted after Q change?" ;;
  *)           fail "Unexpected AI response: $output" ;;
esac

bold "All e2e probes passed."
