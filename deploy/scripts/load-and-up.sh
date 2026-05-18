#!/usr/bin/env bash
# ============================================================
# 云主机本地脚本: 加载镜像 + 校验版本 + 拉起服务
#
# 由 update.sh 调用，也可手动执行。
#
# 前置:
#   - deploy/dist/ 已通过 sync-to-cloud.sh 传过来
#   - deploy/.env 已配置 (IMAGE_TAG 与 MANIFEST 对应)
#
# 用法:
#   cd /opt/xg-prototype/deploy
#   PROFILE=lite ./scripts/load-and-up.sh          # 默认 lite
#   PROFILE=full ./scripts/load-and-up.sh
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

PROFILE="${PROFILE:-lite}"
DIST_DIR="${DEPLOY_DIR}/dist"
ENV_FILE="${DEPLOY_DIR}/.env"

# 云上始终叠加 prod 覆盖：disable 前端 oneshot 构建器（产物已由 sync-to-cloud 传过来）
export COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml:${DEPLOY_DIR}/docker-compose.prod.yml"

# ─── 校验 .env 和 MANIFEST ───
[ -f "${ENV_FILE}" ]              || { err ".env 不存在: ${ENV_FILE}"; exit 1; }
[ -f "${DIST_DIR}/MANIFEST.txt" ] || { err "dist/MANIFEST.txt 不存在，先跑 sync-to-cloud"; exit 1; }

env_tag=$(grep '^IMAGE_TAG=' "${ENV_FILE}" | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'")
manifest_tag=$(grep '^IMAGE_TAG=' "${DIST_DIR}/MANIFEST.txt" | cut -d= -f2)
log ".env IMAGE_TAG     = ${env_tag}"
log "MANIFEST IMAGE_TAG = ${manifest_tag}"

if [ "${env_tag}" != "${manifest_tag}" ]; then
    err "TAG 不一致! .env 中 IMAGE_TAG=${env_tag}, 但 dist/MANIFEST.txt 是 ${manifest_tag}"
    err "请同步更新 .env 中的 IMAGE_TAG，或重新跑本地 build+sync"
    exit 1
fi

# ─── 加载镜像 ───
if [ ! -d "${DIST_DIR}/images" ] || [ -z "$(ls -A "${DIST_DIR}/images" 2>/dev/null)" ]; then
    warn "dist/images/ 为空，跳过 docker load"
else
    for tgz in "${DIST_DIR}/images"/*.tar.gz; do
        step "docker load $(basename "$tgz")"
        gunzip -c "$tgz" | docker load
    done
fi

# ─── 启动 (无 build) ───
step "docker compose --profile ${PROFILE} up -d --no-build"
docker compose --profile "${PROFILE}" up -d --no-build

step "容器状态"
docker compose --profile "${PROFILE}" ps

log "加载完成。镜像版本: ${env_tag}"
