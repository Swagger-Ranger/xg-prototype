#!/bin/bash
# ============================================================
# 高校学生工作服务系统 - 一键部署脚本
# 适用于 CentOS 7.9 云服务器
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="xg-prototype"
DEPLOY_DIR="/opt/${PROJECT_NAME}"
GIT_REPO=""  # 会在交互中询问
PROFILE="lite"  # 默认轻量模式

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

# 检查 root 权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户运行此脚本: sudo ./deploy.sh"
        exit 1
    fi
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_warn "Docker 未安装"
        read -p "是否安装 Docker? (y/n): " install_docker
        if [ "$install_docker" = "y" ] || [ "$install_docker" = "Y" ]; then
            ./install-docker-centos7.sh
        else
            log_error "请先安装 Docker 后重试"
            exit 1
        fi
    fi

    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose 插件未安装"
        exit 1
    fi

    log_info "Docker 版本: $(docker --version)"
    log_info "Docker Compose 版本: $(docker compose version --short)"
}

# 交互式配置
interactive_config() {
    echo ""
    echo "========================================"
    echo "  高校学生工作服务系统 - 部署配置"
    echo "========================================"
    echo ""

    # Git 仓库地址
    read -p "请输入 Git 仓库地址: " git_repo
    if [ -z "$git_repo" ]; then
        log_error "Git 仓库地址不能为空"
        exit 1
    fi
    GIT_REPO="$git_repo"

    # 部署目录
    read -p "部署目录 (默认: /opt/xg-prototype): " deploy_dir
    if [ -n "$deploy_dir" ]; then
        DEPLOY_DIR="$deploy_dir"
    fi

    # 部署模式
    echo ""
    echo "选择部署模式:"
    echo "  1) 轻量模式 (~3.5GB 内存) - 适合 4核8G 服务器"
    echo "  2) 标准模式 (~7.5GB 内存) - 适合 8核16G 服务器"
    read -p "请选择 (1/2, 默认: 1): " mode_choice
    case "$mode_choice" in
        2) PROFILE="full" ;;
        *) PROFILE="lite" ;;
    esac

    log_info "部署模式: $PROFILE"
}

# 克隆项目
clone_project() {
    log_info "克隆项目到 $DEPLOY_DIR..."

    if [ -d "$DEPLOY_DIR" ]; then
        log_warn "目录 $DEPLOY_DIR 已存在"
        read -p "是否删除并重新克隆? (y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            rm -rf "$DEPLOY_DIR"
        else
            log_info "使用现有目录"
            return
        fi
    fi

    git clone "$GIT_REPO" "$DEPLOY_DIR"
    log_info "项目克隆完成"
}

# 配置环境变量
setup_env() {
    log_info "配置环境变量..."

    cd "$DEPLOY_DIR/deploy"

    if [ -f ".env" ]; then
        log_warn ".env 文件已存在"
        read -p "是否重新配置? (y/n): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            return
        fi
    fi

    echo ""
    echo "========================================"
    echo "  环境变量配置"
    echo "========================================"
    echo ""

    # 数据库密码
    read -sp "请输入 PostgreSQL 密码 (默认: postgres123): " db_pass
    echo ""
    db_pass=${db_pass:-postgres123}

    # Redis 密码
    read -sp "请输入 Redis 密码 (默认: redis123): " redis_pass
    echo ""
    redis_pass=${redis_pass:-redis123}

    # MinIO 密码
    read -sp "请输入 MinIO Secret Key (默认: minioadmin123): " minio_key
    echo ""
    minio_key=${minio_key:-minioadmin123}

    # AI 内部密钥
    read -sp "请输入 AI 内部通信密钥 (留空则自动生成): " ai_token
    echo ""
    if [ -z "$ai_token" ]; then
        ai_token=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
    fi

    # LLM API Keys
    read -p "请输入通义千问 API Key (没有则留空): " qwen_key
    read -p "请输入 DeepSeek API Key (没有则留空): " deepseek_key

    # 生成 .env 文件
    cat > .env << EOF
# Database
DB_PASS=$db_pass

# Redis
REDIS_PASS=$redis_pass

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=$minio_key

# AI 内部通信密钥
AI_INTERNAL_TOKEN=$ai_token

# LLM API Keys（可选）
QWEN_API_KEY=$qwen_key
DEEPSEEK_API_KEY=$deepseek_key

# Grafana（仅 full profile）
GRAFANA_PASS=admin123
EOF

    log_info ".env 文件已创建"
}

# 启动服务
start_services() {
    log_info "启动服务 (profile: $PROFILE)..."

    cd "$DEPLOY_DIR/deploy"

    # 拉取基础镜像
    log_info "拉取 Docker 镜像..."
    docker compose pull postgres redis minio nginx

    # 构建并启动
    log_info "构建并启动服务..."
    docker compose --profile $PROFILE up -d --build

    log_info "等待服务启动..."
    sleep 10
}

# 健康检查
health_check() {
    log_info "执行健康检查..."

    cd "$DEPLOY_DIR/deploy"

    # 检查容器状态
    echo ""
    docker compose ps
    echo ""

    # 测试各个端点
    local failed=0

    log_info "测试 Nginx..."
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        log_info "✓ Nginx 正常"
    else
        log_warn "✗ Nginx 未响应"
        failed=1
    fi

    log_info "测试 Java 后端..."
    if curl -sf http://localhost:8080/actuator/health > /dev/null 2>&1; then
        log_info "✓ Java 后端正常"
    else
        log_warn "✗ Java 后端未响应 (可能需要更长时间启动)"
    fi

    log_info "测试 Python AI..."
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        log_info "✓ Python AI 正常"
    else
        log_warn "✗ Python AI 未响应 (可能需要更长时间启动)"
    fi

    return $failed
}

# 显示部署信息
show_summary() {
    echo ""
    echo "========================================"
    echo "  部署完成！"
    echo "========================================"
    echo ""
    echo "项目目录: $DEPLOY_DIR"
    echo "部署模式: $PROFILE"
    echo ""
    echo "服务访问地址:"
    echo "  Web 应用:    http://服务器IP"
    echo "  MinIO 控制台: http://服务器IP:9001"
    echo "  Java API:    http://服务器IP:8080"
    echo "  Python AI:   http://服务器IP:8000"
    if [ "$PROFILE" = "full" ]; then
        echo "  Grafana:     http://服务器IP:3000"
    fi
    echo ""
    echo "常用命令:"
    echo "  cd $DEPLOY_DIR/deploy"
    echo "  docker compose ps              - 查看状态"
    echo "  docker compose logs -f         - 查看日志"
    echo "  ./scripts/update.sh            - 更新代码"
    echo "  docker compose --profile $PROFILE restart  - 重启服务"
    echo ""
    echo "更新代码:"
    echo "  cd $DEPLOY_DIR && git pull && ./deploy/scripts/update.sh"
    echo ""
}

# 主函数
main() {
    check_root
    check_docker
    interactive_config
    clone_project
    setup_env
    start_services
    health_check
    show_summary
}

# 如果有参数，非交互模式
if [ $# -gt 0 ]; then
    case "$1" in
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --help, -h        显示帮助"
            echo "  --quick           快速部署（使用默认参数）"
            echo ""
            exit 0
            ;;
        --quick)
            check_root
            check_docker
            DEPLOY_DIR="/opt/xg-prototype"
            PROFILE="lite"
            if [ -d "$DEPLOY_DIR" ]; then
                log_info "使用现有目录"
            else
                log_error "项目目录不存在，请先克隆项目"
                exit 1
            fi
            setup_env
            start_services
            health_check
            show_summary
            ;;
        *)
            log_error "未知选项: $1"
            exit 1
            ;;
    esac
else
    main
fi
