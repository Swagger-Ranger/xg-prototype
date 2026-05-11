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
  -h, --help             显示帮助信息

示例:
  $0                     # 默认 lite 模式，使用缓存构建
  $0 -f                  # full 模式更新
  $0 -p full -n          # full 模式，无缓存构建
  $0 -s                  # 跳过 git pull，直接重新构建

快速更新流程:
  1. git pull            # 拉取最新代码
  2. $0                  # 运行此脚本更新服务
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

# 构建和启动
build_and_start() {
    if [ "$SKIP_BUILD" = true ]; then
        log_step "跳过构建，直接重启服务..."
        docker compose --profile $PROFILE restart
        return
    fi

    log_step "构建并启动服务..."

    # 清理旧镜像（可选，避免磁盘空间问题）
    if [ -n "$NO_CACHE" ]; then
        log_info "清理旧构建缓存..."
        docker compose --profile $PROFILE rm -f 2>/dev/null || true
        docker system prune -f --volumes=false 2>/dev/null || true
    fi

    # 拉取基础镜像更新
    log_info "更新基础镜像..."
    docker compose pull postgres redis minio nginx 2>/dev/null || true

    # 构建并启动
    log_info "构建应用镜像..."
    docker compose --profile $PROFILE up -d --build $NO_CACHE

    # 显示构建结果
    echo ""
    docker images | grep "xg-" || true
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
    init_logs           # 初始化日志目录和轮转配置
    git_operations
    backup_data
    stop_services
    build_and_start
    health_check
    show_summary
}

# 运行
main "$@"
