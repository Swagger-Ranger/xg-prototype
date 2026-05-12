#!/bin/bash
# ============================================================
# 高校学生工作服务系统 - 代码更新脚本
# 用于 git pull 后快速重新构建和部署服务
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
PROFILE="lite"
SKIP_BUILD=false
KEEP_DATA=true
QUICK_MODE=false
USE_DEMO_ENV=false

# 智能构建检测
NEED_REBUILD_JAVA=false
NEED_REBUILD_PYTHON=false
NEED_REBUILD_WEB=false
LAST_COMMIT_FILE=".last_deploy_commit"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 使用帮助
show_help() {
    cat << EOF
用法: $0 [选项]

选项:
  -p, --profile <模式>   部署模式: lite 或 full (默认: lite)
  -f, --full             使用 full 模式（等同 --profile full）
  -l, --lite             使用 lite 模式（等同 --profile lite）
  -n, --no-cache         不使用 Docker 缓存，强制重新构建
  -d, --no-data          更新时清除数据卷（危险！）
  -s, --skip-pull        跳过 git pull 步骤
  -b, --skip-build       跳过构建步骤，只重启服务
  -q, --quick            快速模式：只重启，不构建、不拉取（演示环境推荐）
  --demo                 使用演示环境配置 (.env.demo)
  -h, --help             显示帮助信息

智能构建检测:
  脚本会自动检测代码变更，只重建变更的部分：
  - xg-backend/ 变更 → 重建 Java 服务
  - xg-ai/ 变更 → 重建 Python 服务
  - xg-frontend/ 变更 → 重建前端（使用 Docker 构建，无需服务器装 Node.js）
  - 无变更 → 直接重启

示例:
  $0                     # 默认 lite 模式，智能构建（代码没变则不重建）
  $0 -q                  # 快速重启（演示环境日常使用）
  $0 -f                  # full 模式更新
  $0 -p full -n          # full 模式，无缓存构建
  $0 --demo              # 使用演示环境配置启动
  $0 -s                  # 跳过 git pull，直接重新构建

快速更新流程（演示环境）:
  1. git pull            # 拉取最新代码
  2. $0 -q               # 快速重启（不重建，秒级）

完整更新流程（代码有变更）:
  1. git pull            # 拉取最新代码
  2. $0                  # 智能更新（自动检测前后端变更并重建）

本地开发 + Docker 部署方案:
  - 本地开发：使用 vibe coding，直接修改代码
  - 代码提交：git add . && git commit -m "xxx" && git push
  - 服务器更新：git pull && ./deploy/scripts/update.sh
  - 前端自动构建：服务器使用 Docker 构建，无需安装 Node.js
EOF
}

# 解析参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--profile)
                PROFILE="$2"
                shift 2
                ;;
            -f|--full)
                PROFILE="full"
                shift
                ;;
            -l|--lite)
                PROFILE="lite"
                shift
                ;;
            -n|--no-cache)
                NO_CACHE="--no-cache"
                shift
                ;;
            -d|--no-data)
                KEEP_DATA=false
                shift
                ;;
            -s|--skip-pull)
                SKIP_PULL=true
                shift
                ;;
            -b|--skip-build)
                SKIP_BUILD=true
                shift
                ;;
            -q|--quick)
                QUICK_MODE=true
                SKIP_BUILD=true
                SKIP_PULL=true
                shift
                ;;
            --demo)
                USE_DEMO_ENV=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# 检查环境
check_environment() {
    log_step "检查环境..."

    # 检查是否在项目目录
    if [ ! -f "docker-compose.yml" ]; then
        # 尝试切换到 deploy 目录
        if [ -f "deploy/docker-compose.yml" ]; then
            log_info "进入 deploy 目录"
            cd deploy
        else
            log_error "未找到 docker-compose.yml，请在项目根目录或 deploy 目录运行此脚本"
            exit 1
        fi
    fi

    # 演示环境使用 .env.demo
    if [ "$USE_DEMO_ENV" = true ]; then
        if [ -f ".env.demo" ]; then
            log_info "使用演示环境配置 (.env.demo)"
            # 备份当前 .env
            if [ -f ".env" ] && [ ! -f ".env.backup" ]; then
                cp .env .env.backup
            fi
            cp .env.demo .env
        else
            log_warn ".env.demo 不存在，使用默认 .env"
        fi
    fi

    # 检查 .env 文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_warn ".env 文件不存在，从模板创建"
            cp .env.example .env
            log_warn "请编辑 .env 文件配置环境变量后再运行"
            exit 1
        else
            log_error ".env 文件不存在"
            exit 1
        fi
    fi

    # 检查 Docker
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi

    log_info "当前目录: $(pwd)"
    log_info "部署模式: $PROFILE"

    # 快速模式提示
    if [ "$QUICK_MODE" = true ]; then
        log_info "快速模式: 只重启服务，不构建、不拉取代码"
    fi
}

# 智能检测是否需要重新构建
check_need_rebuild() {
    if [ "$QUICK_MODE" = true ] || [ "$SKIP_BUILD" = true ]; then
        return
    fi

    log_step "检查代码变更..."

    # 获取当前提交哈希
    local current_commit
    current_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

    # 获取上次部署的提交哈希
    local last_commit
    if [ -f "$LAST_COMMIT_FILE" ]; then
        last_commit=$(cat "$LAST_COMMIT_FILE")
    else
        last_commit=""
    fi

    if [ "$current_commit" = "$last_commit" ]; then
        log_info "代码未变更 (commit: ${current_commit:0:8})"
        log_info "使用快速模式重启（如需强制重建请使用 -n 参数）"
        SKIP_BUILD=true
        return
    fi

    # 检查哪些目录有变更
    if [ -n "$last_commit" ]; then
        log_info "检测到代码变更: ${last_commit:0:8} → ${current_commit:0:8}"

        # 检查 Java 后端是否有变更
        if git diff --name-only "$last_commit" "$current_commit" | grep -q "^xg-backend/"; then
            log_info "Java 后端代码有变更，需要重建"
            NEED_REBUILD_JAVA=true
        fi

        # 检查 Python AI 是否有变更
        if git diff --name-only "$last_commit" "$current_commit" | grep -q "^xg-ai/"; then
            log_info "Python AI 代码有变更，需要重建"
            NEED_REBUILD_PYTHON=true
        fi

        # 检查前端是否有变更
        if git diff --name-only "$last_commit" "$current_commit" | grep -q "^xg-frontend/"; then
            log_info "前端代码有变更，需要重新构建"
            NEED_REBUILD_WEB=true
        fi

        # 检查 Dockerfile 或 docker-compose 是否有变更
        if git diff --name-only "$last_commit" "$current_commit" | grep -qE "^deploy/(Dockerfile|docker-compose)"; then
            log_info "部署配置有变更，需要重建"
            NEED_REBUILD_JAVA=true
            NEED_REBUILD_PYTHON=true
        fi

        # 首次部署需要构建前端
        if [ ! -d "../xg-frontend/apps/web/dist" ] && [ ! "$(docker volume ls -q | grep web_dist)" ]; then
            log_info "前端未构建，需要构建"
            NEED_REBUILD_WEB=true
        fi

        # 如果没有特定变更但提交不同，默认重建 Java（通常有配置变更）
        if [ "$NEED_REBUILD_JAVA" = false ] && [ "$NEED_REBUILD_PYTHON" = false ] && [ "$NEED_REBUILD_WEB" = false ]; then
            log_info "其他文件有变更，默认重建 Java 服务"
            NEED_REBUILD_JAVA=true
        fi
    else
        log_info "首次部署或记录丢失，完整构建"
        NEED_REBUILD_JAVA=true
        NEED_REBUILD_PYTHON=true
    fi
}

# 记录当前部署的提交
record_deploy_commit() {
    if [ -d ".git" ]; then
        git rev-parse HEAD > "$LAST_COMMIT_FILE" 2>/dev/null || true
    fi
}

# 初始化日志目录
init_logs() {
    log_step "检查日志目录..."

    # 创建日志目录
    if [ ! -d "/data/logs" ]; then
        log_info "创建日志目录..."
        mkdir -p /data/logs/{java,python,nginx,postgres,redis,minio}
        chmod 755 /data/logs /data/logs/*
    fi

    # 配置 logrotate（如果脚本存在且未配置）
    if [ -f "./scripts/setup-logs.sh" ] && [ ! -f "/etc/logrotate.d/xg-services" ]; then
        log_info "配置日志轮转..."
        ./scripts/setup-logs.sh
    fi
}

# Git 操作
git_operations() {
    if [ "$SKIP_PULL" = true ]; then
        log_info "跳过 git pull"
        return
    fi

    log_step "更新代码..."

    # 获取项目根目录
    local project_root
    if [ -d "../.git" ]; then
        project_root=".."
    elif [ -d ".git" ]; then
        project_root="."
    else
        log_warn "未找到 .git 目录，跳过 git pull"
        return
    fi

    cd "$project_root"

    # 检查是否有未提交的更改
    if ! git diff --quiet HEAD 2>/dev/null; then
        log_warn "检测到未提交的更改"
        read -p "是否暂存更改并继续? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            git stash
            STASHED=true
        else
            log_error "请先提交或撤销更改后再更新"
            exit 1
        fi
    fi

    # 拉取最新代码
    log_info "拉取最新代码..."
    if ! git pull; then
        log_error "git pull 失败"
        exit 1
    fi

    # 如果有暂存的更改，尝试恢复
    if [ "$STASHED" = true ]; then
        log_info "恢复暂存的更改..."
        git stash pop || log_warn "恢复暂存更改时出错"
    fi

    # 显示最新提交
    log_info "最新提交:"
    git log -1 --oneline --decorate

    # 返回 deploy 目录
    cd - > /dev/null
}

# 备份数据
backup_data() {
    if [ "$KEEP_DATA" = false ]; then
        log_warn "已设置清除数据，跳过备份"
        return
    fi

    log_step "备份数据..."

    local backup_dir="../backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # 备份数据库（如果运行中）
    if docker ps | grep -q "xg-postgres"; then
        log_info "备份 PostgreSQL..."
        if docker exec xg-postgres pg_dump -U postgres xg1 > "$backup_dir/db_backup.sql" 2>/dev/null; then
            log_info "数据库备份完成: $backup_dir/db_backup.sql"
        else
            log_warn "数据库备份失败（可能数据库未就绪）"
        fi
    fi

    # 备份 MinIO 数据路径记录
    log_info "记录数据卷信息..."
    docker volume ls | grep xg > "$backup_dir/volumes.txt" 2>/dev/null || true
}

# 停止服务
stop_services() {
    log_step "停止当前服务..."

    # 优雅停止
    docker compose --profile lite --profile full stop || true

    # 等待服务停止
    sleep 3
}

# 构建前端
build_web() {
    if [ "$NEED_REBUILD_WEB" = false ] && [ "$SKIP_BUILD" = false ]; then
        return
    fi

    log_step "构建前端..."

    # 使用 Docker 构建前端
    log_info "使用 Docker 构建前端（无需服务器安装 Node.js）..."

    # 确保 web_dist 卷存在
    docker volume create web_dist 2>/dev/null || true

    # 清空旧的前端文件
    log_info "清空旧的前端文件..."
    docker run --rm -v web_dist:/web-dist alpine sh -c "rm -rf /web-dist/*" 2>/dev/null || true

    # 构建前端镜像
    log_info "构建前端镜像..."
    docker build -f ./Dockerfile.web -t xg-web-builder:latest ../xg-frontend

    # 创建临时容器复制构建产物到卷
    log_info "复制构建产物到 web_dist 卷..."
    docker run --rm -v web_dist:/web-dist xg-web-builder:latest sh -c "cp -r /output/* /web-dist/ && ls -la /web-dist/"

    log_info "前端构建完成"
}

# 构建和启动
build_and_start() {
    # 构建前端（如果需要）
    if [ "$NEED_REBUILD_WEB" = true ]; then
        build_web
    fi

    if [ "$SKIP_BUILD" = true ]; then
        log_step "快速重启服务..."
        docker compose --profile $PROFILE restart
        return
    fi

    log_step "构建并启动服务..."

    # 清理旧镜像（仅无缓存模式）
    if [ -n "$NO_CACHE" ]; then
        log_info "清理旧构建缓存..."
        docker compose --profile $PROFILE rm -f 2>/dev/null || true
        docker system prune -f --volumes=false 2>/dev/null || true
    fi

    # 拉取基础镜像更新
    log_info "更新基础镜像..."
    docker compose pull postgres redis minio nginx 2>/dev/null || true

    # 根据变更情况选择性构建
    if [ "$NEED_REBUILD_JAVA" = true ] && [ "$NEED_REBUILD_PYTHON" = true ]; then
        log_info "构建 Java 和 Python 服务..."
        docker compose --profile $PROFILE up -d --build $NO_CACHE
    elif [ "$NEED_REBUILD_JAVA" = true ]; then
        log_info "仅构建 Java 服务..."
        docker compose --profile $PROFILE up -d --build $NO_CACHE xg-java
        docker compose --profile $PROFILE up -d xg-python nginx
    elif [ "$NEED_REBUILD_PYTHON" = true ]; then
        log_info "仅构建 Python 服务..."
        docker compose --profile $PROFILE up -d --build $NO_CACHE xg-python
        docker compose --profile $PROFILE up -d xg-java nginx
    else
        log_info "无后端代码变更，启动服务..."
        docker compose --profile $PROFILE up -d
    fi

    # 显示构建结果
    echo ""
    docker images | grep -E "(xg-|deploy-)" || true

    # 记录部署提交
    record_deploy_commit
}

# 健康检查
health_check() {
    log_step "执行健康检查..."

    echo ""
    log_info "容器状态:"
    docker compose ps
    echo ""

    # 等待服务就绪
    log_info "等待服务就绪（约 30 秒）..."
    sleep 10

    local check_url="http://localhost:8080/actuator/health"
    local max_attempts=12
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$check_url" > /dev/null 2>&1; then
            log_info "✓ Java 后端已就绪"
            break
        fi
        echo -n "."
        sleep 5
        attempt=$((attempt + 1))
    done

    if [ $attempt -gt $max_attempts ]; then
        log_warn "Java 后端启动超时，请手动检查日志"
    fi

    echo ""

    # 检查 Python
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        log_info "✓ Python AI 已就绪"
    else
        log_warn "Python AI 未就绪（可能需要更长时间）"
    fi

    # 检查 Nginx
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        log_info "✓ Nginx 已就绪"
    else
        log_warn "Nginx 未就绪"
    fi
}

# 显示摘要
show_summary() {
    echo ""
    echo "========================================"
    echo -e "  ${GREEN}更新完成！${NC}"
    echo "========================================"
    echo ""
    echo "部署模式: $PROFILE"
    echo ""
    echo "服务状态:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
    echo ""
    echo "查看日志:"
    echo "  docker compose logs -f         # 全部日志"
    echo "  docker compose logs -f xg-java # Java 日志"
    echo "  docker compose logs -f xg-python # Python 日志"
    echo ""
    echo "常用命令:"
    echo "  docker compose --profile $PROFILE restart  # 重启服务"
    echo "  docker compose --profile $PROFILE down     # 停止服务"
    echo ""
}

# 主函数
main() {
    parse_args "$@"
    check_environment
    init_logs                   # 初始化日志目录和轮转配置
    check_need_rebuild          # 智能检测是否需要重建
    git_operations
    backup_data
    stop_services
    build_and_start             # 根据检测结果选择性构建
    health_check
    show_summary
}

# 运行
main "$@"
