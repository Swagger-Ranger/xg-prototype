#!/usr/bin/env bash
# ============================================================
# 本地构建脚本 (Mac / Linux 都可，但 Mac arm64 必走 buildx 交叉编译)
#
# 产出:
#   deploy/dist/images/xg-java-<TAG>.tar.gz
#   deploy/dist/images/xg-python-<TAG>.tar.gz
#   deploy/dist/web-dist/                      (前端 dist)
#   deploy/dist/MANIFEST.txt                   (版本/提交/构建时间)
#
# 用法:
#   ./deploy/scripts/build-local.sh                       # 构建全部 (java + python + web)
#   ./deploy/scripts/build-local.sh --services java       # 只重建 Java 镜像
#   ./deploy/scripts/build-local.sh --services java,web   # Java + 前端
#   IMAGE_TAG=v1.0.0 ./deploy/scripts/build-local.sh      # 自定义 tag (默认 git short SHA)
#
# 前置条件:
#   - docker desktop 启用 buildx (Mac 默认开启)
#   - 前端构建需本机已装 node >= 20 + pnpm >= 9
# ============================================================

set -euo pipefail

# ─── 颜色 ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# ─── 路径 ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${REPO_ROOT}/deploy/dist"
IMG_DIR="${DIST_DIR}/images"
cd "${REPO_ROOT}"

# ─── 参数 ───
SERVICES="java,python,web"
while [[ $# -gt 0 ]]; do
    case $1 in
        --services) SERVICES="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,20p' "$0"; exit 0 ;;
        *) err "未知参数: $1"; exit 1 ;;
    esac
done

want() { [[ ",${SERVICES}," == *",$1,"* ]]; }

# ─── 版本号 ───
if [ -z "${IMAGE_TAG:-}" ]; then
    if git rev-parse --short HEAD >/dev/null 2>&1; then
        IMAGE_TAG=$(git rev-parse --short HEAD)
    else
        IMAGE_TAG=$(date -u +%Y%m%d-%H%M%S)
    fi
fi
log "IMAGE_TAG = ${IMAGE_TAG}"
log "SERVICES  = ${SERVICES}"
mkdir -p "${IMG_DIR}"

# ─── buildx 准备 (一次性，幂等) ───
# 策略:
#   1) 优先复用 Docker Desktop 自带的 desktop-linux builder —— 它本身就支持
#      linux/amd64 / arm64 多平台,无需再拉 moby/buildkit 镜像,避开 docker.io 网络问题。
#   2) 仅当 desktop-linux 不可用时,才创建独立的 xg-builder (docker-container 驱动),
#      并通过 DaoCloud 镜像源拉 buildkit,避免直连 registry-1.docker.io。
BUILDKIT_MIRROR_IMAGE="${BUILDKIT_MIRROR_IMAGE:-docker.m.daocloud.io/moby/buildkit:buildx-stable-1}"

ensure_buildx() {
    if ! docker buildx version >/dev/null 2>&1; then
        err "docker buildx 未安装，Mac Docker Desktop 默认带，请升级 Docker"
        exit 1
    fi

    # 优先用 desktop-linux: 已 running、已支持多平台,零拉取成本。
    # 注意: 不能用 `grep -q`,因为 set -o pipefail 下 grep 提前退出会让上游 docker
    # buildx inspect 收到 SIGPIPE,导致 pipeline 误判为失败。改成读完所有输入再丢弃。
    local desktop_info
    if desktop_info=$(docker buildx inspect desktop-linux 2>/dev/null) \
       && echo "${desktop_info}" | grep -E "Status:[[:space:]]+running" >/dev/null \
       && echo "${desktop_info}" | grep "linux/amd64" >/dev/null; then
        docker buildx use desktop-linux >/dev/null
        log "复用 Docker Desktop 内置 builder: desktop-linux (无需拉取 buildkit 镜像)"
        return
    fi

    # 回退: 创建独立的 xg-builder,buildkit 镜像走 DaoCloud
    if docker buildx inspect xg-builder >/dev/null 2>&1; then
        docker buildx use xg-builder >/dev/null
        log "复用已有 builder: xg-builder"
        return
    fi

    log "创建 buildx builder: xg-builder (buildkit 镜像源 = ${BUILDKIT_MIRROR_IMAGE})"
    if ! docker buildx create \
            --name xg-builder \
            --driver docker-container \
            --driver-opt "image=${BUILDKIT_MIRROR_IMAGE}" \
            --use >/dev/null; then
        err "创建 xg-builder 失败。可能原因:"
        err "  - ${BUILDKIT_MIRROR_IMAGE} 拉取失败 → 换镜像源: BUILDKIT_MIRROR_IMAGE=xxx ./deploy/scripts/build-local.sh"
        err "  - Docker Desktop 未运行或 daemon.json 的 registry-mirrors 已失效"
        exit 1
    fi
}

# ─── 通用：build + save ───
# build_and_save <服务名> <Dockerfile 路径> <镜像名>
build_and_save() {
    local svc="$1" dockerfile="$2" image="$3"
    local tag="${image}:${IMAGE_TAG}"
    local tar_path="${IMG_DIR}/${image}-${IMAGE_TAG}.tar.gz"

    step "[${svc}] 交叉编译 linux/amd64 → ${tag}"
    docker buildx build \
        --platform linux/amd64 \
        --file "${dockerfile}" \
        --tag "${tag}" \
        --load \
        "${REPO_ROOT}"

    step "[${svc}] docker save → ${tar_path}"
    docker save "${tag}" | gzip > "${tar_path}"
    log "[${svc}] 完成 ($(du -h "${tar_path}" | cut -f1))"
}

# ─── Java ───
if want java; then
    ensure_buildx
    build_and_save java "deploy/Dockerfile.java" "xg-java"
fi

# ─── Python ───
if want python; then
    ensure_buildx
    build_and_save python "deploy/Dockerfile.python" "xg-python"
fi

# ─── 前端 ───
if want web; then
    step "[web] 本地 pnpm build (输出: xg-frontend/apps/web/dist)"
    if ! command -v pnpm >/dev/null 2>&1; then
        err "pnpm 未安装。Mac: npm install -g pnpm@9.1.0"
        exit 1
    fi
    ( cd "${REPO_ROOT}/xg-frontend" && \
      pnpm install --frozen-lockfile && \
      pnpm run build --filter=@xg1/web )

    step "[web] 复制 dist → ${DIST_DIR}/web-dist"
    rm -rf "${DIST_DIR}/web-dist"
    mkdir -p "${DIST_DIR}/web-dist"
    cp -r "${REPO_ROOT}/xg-frontend/apps/web/dist/." "${DIST_DIR}/web-dist/"
    log "[web] 完成 ($(du -sh "${DIST_DIR}/web-dist" | cut -f1))"
fi

# ─── MANIFEST ───
step "写 MANIFEST.txt"
cat > "${DIST_DIR}/MANIFEST.txt" <<EOF
IMAGE_TAG=${IMAGE_TAG}
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo unknown)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
BUILT_SERVICES=${SERVICES}
HOST=$(uname -srm)
EOF
cat "${DIST_DIR}/MANIFEST.txt"

echo ""
log "构建完成。下一步:"
echo "  1. ./deploy/scripts/sync-to-cloud.sh   # 同步到云主机"
echo "  2. (云上) ./deploy/scripts/update.sh   # 加载并启动"
echo ""
echo "  注: IMAGE_TAG (${IMAGE_TAG}) 会由 load-and-up.sh 自动写入云上 .env,无需手工编辑。"
echo "  如需本地用 docker compose 直接启动,本地 .env 仍需手动加 IMAGE_TAG=${IMAGE_TAG}。"


