#!/bin/bash
# ============================================================
# 日志目录初始化和轮转配置脚本
# 配置：保留7天，超过指定大小自动打包压缩
# ============================================================

set -e

LOG_BASE_DIR="/data/logs"

# 配置参数（可修改）
KEEP_DAYS=7
MAX_SIZE="100M"  # 单日志文件超过 100MB 就轮转

if [ -f ".env" ]; then
    source .env 2>/dev/null || true
fi

echo "========================================"
echo "  初始化日志目录和轮转配置"
echo "========================================"
echo "  保留天数: ${KEEP_DAYS} 天"
echo "  触发轮转大小: ${MAX_SIZE}"
echo ""

# 创建日志目录
echo "[1/3] 创建日志目录..."
mkdir -p ${LOG_BASE_DIR}/{java,python,nginx,postgres,redis,minio}

# 设置权限
echo "[2/3] 设置目录权限..."
chmod 755 ${LOG_BASE_DIR}
chmod 755 ${LOG_BASE_DIR}/*

# 为 PostgreSQL 设置特殊权限（容器内用户ID为999）
chown 999:999 ${LOG_BASE_DIR}/postgres 2>/dev/null || true

# 创建 logrotate 配置
echo "[3/3] 配置 logrotate..."
cat > /etc/logrotate.d/xg-services << EOF
# ============================================================
# 高校学生工作服务系统 - 日志轮转配置
# 规则：保留 ${KEEP_DAYS} 天，超过 ${MAX_SIZE} 自动打包压缩
# ============================================================

# Java 服务日志
/data/logs/java/*.log {
    daily                    # 每天检查一次
    rotate ${KEEP_DAYS}      # 保留 ${KEEP_DAYS} 个历史文件
    maxsize ${MAX_SIZE}      # 超过 ${MAX_SIZE} 立即轮转（不等到第二天）
    minsize 1M               # 小于 1M 不轮转（避免空文件）
    compress                 # 轮转后压缩为 .gz
    delaycompress            # 延迟压缩（保留最近一个未压缩）
    missingok                # 日志不存在不报错
    notifempty               # 空文件不轮转
    create 644 root root     # 创建新日志的权限
    dateext                  # 使用日期作为后缀
    dateformat -%Y%m%d-%H%M%S # 日期格式：-年月日-时分秒
}

# Python 服务日志
/data/logs/python/*.log {
    daily
    rotate ${KEEP_DAYS}
    maxsize ${MAX_SIZE}
    minsize 1M
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    dateext
    dateformat -%Y%m%d-%H%M%S
}

# Nginx 访问日志
/data/logs/nginx/access.log {
    daily
    rotate ${KEEP_DAYS}
    maxsize ${MAX_SIZE}
    minsize 1M
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    dateext
    dateformat -%Y%m%d-%H%M%S
    postrotate
        # 通知 Nginx 重新打开日志文件
        docker kill --signal="USR1" xg-nginx 2>/dev/null || true
    endscript
}

# Nginx 错误日志
/data/logs/nginx/error.log {
    daily
    rotate ${KEEP_DAYS}
    maxsize ${MAX_SIZE}
    minsize 1M
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    dateext
    dateformat -%Y%m%d-%H%M%S
    postrotate
        docker kill --signal="USR1" xg-nginx 2>/dev/null || true
    endscript
}

# PostgreSQL 日志
/data/logs/postgres/*.log {
    daily
    rotate ${KEEP_DAYS}
    maxsize 50M                # PG 日志较大，50MB 就轮转
    minsize 1M
    compress
    delaycompress
    missingok
    notifempty
    create 600 999 999         # postgres 用户权限
    dateext
    dateformat -%Y%m%d-%H%M%S
}

# 打包旧日志目录（每月执行一次）
/data/logs {
    monthly
    rotate 3
    compress
    missingok
    notifempty
    create 755 root root
    dateext
    lastaction
        # 删除 30 天前的压缩包
        find /data/logs -name "*.gz" -mtime +30 -delete 2>/dev/null || true
    endscript
}
EOF

echo "✓ logrotate 配置已创建: /etc/logrotate.d/xg-services"

# 确保 logrotate 定时任务运行
echo ""
echo "[4/4] 确保 logrotate 定时任务..."
if [ -f /etc/cron.daily/logrotate ]; then
    echo "✓ logrotate 每日任务已存在"
else
    echo "创建 logrotate 定时任务..."
    cat > /etc/cron.daily/xg-logrotate << 'EOF'
#!/bin/bash
/usr/sbin/logrotate -f /etc/logrotate.d/xg-services 2>/dev/null || true
EOF
    chmod +x /etc/cron.daily/xg-logrotate
fi

# 测试 logrotate 配置
echo ""
echo "测试 logrotate 配置..."
logrotate -d /etc/logrotate.d/xg-services 2>&1 | head -30

echo ""
echo "========================================"
echo "  日志目录初始化完成！"
echo "========================================"
echo ""
echo "日志目录结构:"
tree -d -L 1 ${LOG_BASE_DIR} 2>/dev/null || ls -la ${LOG_BASE_DIR}
echo ""
echo "配置摘要:"
echo "  - 保留天数: ${KEEP_DAYS} 天"
echo "  - 触发大小: ${MAX_SIZE}（超过立即轮转）"
echo "  - 压缩格式: .gz"
echo "  - 文件名格式: application.log-YYYYMMDD-HHMMSS.gz"
echo ""
echo "常用命令:"
echo "  查看日志:     tail -f /data/logs/java/application.log"
echo "  手动轮转:     logrotate -f /etc/logrotate.d/xg-services"
echo "  查看压缩包:   ls -lh /data/logs/java/*.gz"
echo "  清理旧日志:   find /data/logs -name '*.gz' -mtime +7 -delete"
echo ""
