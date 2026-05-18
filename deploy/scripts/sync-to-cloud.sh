#!/usr/bin/env bash
# ============================================================
# 把本地构建产物 + 配置文件同步到云主机
#
# 前置:
#   1. 已跑过 ./deploy/scripts/build-local.sh，deploy/dist/ 有产物
#   2. 在 deploy/.env.deploy 中配置好云主机连接信息 (git 忽略)
#
# .env.deploy 模板:
#   CLOUD_HOST=1.2.3.4
#   CLOUD_USER=root
#   CLOUD_PATH=/opt/xg-prototype
#   CLOUD_PORT=22                 # 可选
#   CLOUD_SSH_KEY=~/.ssh/id_rsa   # 可选
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${REPO_ROOT}/deploy"

# ─── 读取 .env.deploy ───
ENV_DEPLOY="${DEPLOY_DIR}/.env.deploy"
if [ ! -f "${ENV_DEPLOY}" ]; then
    err ".env.deploy 不存在。请在 ${ENV_DEPLOY} 创建，内容示例:"
    cat <<'EOF'
CLOUD_HOST=1.2.3.4
CLOUD_USER=root
CLOUD_PATH=/opt/xg-prototype
# CLOUD_PORT=22
# CLOUD_SSH_KEY=~/.ssh/id_rsa
EOF
    exit 1
fi
# shellcheck disable=SC1090
source "${ENV_DEPLOY}"
: "${CLOUD_HOST:?CLOUD_HOST 未在 .env.deploy 中设置}"
: "${CLOUD_USER:?CLOUD_USER 未在 .env.deploy 中设置}"
: "${CLOUD_PATH:?CLOUD_PATH 未在 .env.deploy 中设置}"

SSH_OPTS=()
[ -n "${CLOUD_PORT:-}" ]    && SSH_OPTS+=("-p" "${CLOUD_PORT}")
[ -n "${CLOUD_SSH_KEY:-}" ] && SSH_OPTS+=("-i" "${CLOUD_SSH_KEY}")
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

REMOTE="${CLOUD_USER}@${CLOUD_HOST}:${CLOUD_PATH}/deploy/"
log "目标: ${REMOTE}"

# ─── 校验本地产物存在 ───
DIST_DIR="${DEPLOY_DIR}/dist"
if [ ! -f "${DIST_DIR}/MANIFEST.txt" ]; then
    err "${DIST_DIR}/MANIFEST.txt 不存在，请先跑 build-local.sh"
    exit 1
fi
log "本地 MANIFEST:"
cat "${DIST_DIR}/MANIFEST.txt" | sed 's/^/    /'

# ─── 远程目录预创建 ───
step "确保远端目录存在"
ssh "${SSH_OPTS[@]}" "${CLOUD_USER}@${CLOUD_HOST}" "mkdir -p ${CLOUD_PATH}/deploy/dist"

# ─── 1) 同步配置类文件 (轻量) ───
# 排除 dist/ (单独传)、本地敏感文件、构建工具产物
step "rsync 配置 + 脚本"
rsync -avz --delete \
    -e "${RSYNC_SSH}" \
    --exclude='dist/' \
    --exclude='.env' \
    --exclude='.env.deploy' \
    --exclude='logs/' \
    "${DEPLOY_DIR}/" \
    "${REMOTE}"

# ─── 2) 同步前端 dist (静态资源，rsync 增量) ───
if [ -d "${DIST_DIR}/web-dist" ]; then
    step "rsync 前端 dist"
    rsync -avz --delete \
        -e "${RSYNC_SSH}" \
        "${DIST_DIR}/web-dist/" \
        "${CLOUD_USER}@${CLOUD_HOST}:${CLOUD_PATH}/deploy/dist/web-dist/"
fi

# ─── 3) 传镜像 tar (大文件，scp 走 SSH 压缩通道) ───
if compgen -G "${DIST_DIR}/images/*.tar.gz" > /dev/null; then
    step "scp 镜像 tar.gz (大文件，可能较慢)"
    for tgz in "${DIST_DIR}/images"/*.tar.gz; do
        log "  → $(basename "$tgz") ($(du -h "$tgz" | cut -f1))"
        scp "${SSH_OPTS[@]}" -C "$tgz" \
            "${CLOUD_USER}@${CLOUD_HOST}:${CLOUD_PATH}/deploy/dist/images/"
    done
fi

# ─── 4) 传 MANIFEST ───
scp "${SSH_OPTS[@]}" "${DIST_DIR}/MANIFEST.txt" \
    "${CLOUD_USER}@${CLOUD_HOST}:${CLOUD_PATH}/deploy/dist/MANIFEST.txt"

echo ""
log "同步完成。下一步登录云主机执行:"
echo "  cd ${CLOUD_PATH}/deploy && ./scripts/update.sh"
