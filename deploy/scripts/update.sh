#!/usr/bin/env bash
# ============================================================
# 云主机 — 更新部署 (薄壳)
#
# 新流程：构建产物在本地 Mac 生成，本脚本只负责
#   1. 调 load-and-up.sh 加载镜像 + 重启服务
#   2. 健康检查
#   3. 摘要输出
#
# **不再做 git pull、docker build、智能 diff 检测**——这些逻辑已搬到本地
# deploy/scripts/build-local.sh + sync-to-cloud.sh。
#
# 用法:
#   ./update.sh                    # 默认 lite, 加载新镜像并重启
#   ./update.sh -f                 # full 模式
#   ./update.sh -q                 # 快速重启 (不加载镜像，仅 docker compose restart)
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${DEPLOY_DIR}"

PROFILE="lite"
QUICK_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile) PROFILE="$2"; shift 2 ;;
        -f|--full)    PROFILE="full"; shift ;;
        -l|--lite)    PROFILE="lite"; shift ;;
        -q|--quick)   QUICK_MODE=true; shift ;;
        -h|--help)    sed -n '2,18p' "$0"; exit 0 ;;
        *) err "未知参数: $1"; exit 1 ;;
    esac
done
export PROFILE

# 云上始终叠加 prod 覆盖（一致地让所有 docker compose 子命令都生效）
export COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml:${DEPLOY_DIR}/docker-compose.prod.yml"

# ─── 检查环境 ───
[ -f ".env" ] || { err ".env 不存在，请先 cp .env.example .env 并配置"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose 未安装"; exit 1; }

# ─── 快速模式：仅 restart，不动镜像 ───
if [ "$QUICK_MODE" = true ]; then
    step "快速重启 (不加载新镜像)"
    docker compose --profile "${PROFILE}" restart
    docker compose --profile "${PROFILE}" ps
    exit 0
fi

# ─── 标准流程：加载新镜像 + 起服务 ───
"${SCRIPT_DIR}/load-and-up.sh"

# ─── 健康检查 ───
step "等待服务就绪 (10s)"
sleep 10

check() {
    local name="$1" url="$2" attempts=12
    for ((i=1; i<=attempts; i++)); do
        if curl -sf "${url}" >/dev/null 2>&1; then
            log "✓ ${name}"; return 0
        fi
        sleep 5
    done
    warn "✗ ${name} 未就绪 (${url})"
}
check "Java"   "http://localhost:8080/actuator/health"
check "Python" "http://localhost:8000/health"
check "Nginx"  "http://localhost/"

# ─── 摘要 ───
echo ""
echo "========================================"
log "更新完成"
echo "========================================"
docker compose --profile "${PROFILE}" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null \
  || docker compose --profile "${PROFILE}" ps

cat <<EOF

常用命令:
  docker compose logs -f xg-java
  docker compose logs -f xg-python
  docker compose --profile ${PROFILE} restart
  docker compose --profile ${PROFILE} down

如需回滚：把 .env 的 IMAGE_TAG 改为旧版本，重跑 ./scripts/update.sh
(旧镜像 docker images xg-java 仍在本地，可直接复用)
EOF
