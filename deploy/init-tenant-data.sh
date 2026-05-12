#!/bin/bash
# ============================================================
# 租户数据初始化脚本
# 将所有 Flyway 迁移脚本中的数据导入到 tenant_default schema
# ============================================================

set -e

TENANT_ID="default"
SCHEMA_NAME="tenant_default"
DB_NAME="xg1"
DB_USER="postgres"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取 Postgres 容器名
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | grep -E "^xg-" | head -1)
if [ -z "$POSTGRES_CONTAINER" ]; then
    POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
fi

if [ -z "$POSTGRES_CONTAINER" ]; then
    log_error "找不到 Postgres 容器"
    exit 1
fi

log_info "使用 Postgres 容器: $POSTGRES_CONTAINER"

# 创建 schema
create_schema() {
    log_info "创建 schema: $SCHEMA_NAME"
    docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -c "CREATE SCHEMA IF NOT EXISTS $SCHEMA_NAME;" 2>/dev/null
}

# 处理单个 SQL 文件
process_sql_file() {
    local file=$1
    local basename=$(basename "$file")
    
    log_info "处理: $basename"
    
    # 先替换带引号的 '${tenant_id}'，再替换不带引号的 ${tenant_id}
    # 使用临时文件避免管道问题
    local tmpfile=$(mktemp)
    
    # 第一步：替换 '${tenant_id}' -> 'default'
    sed "s/'\${tenant_id}'/'$TENANT_ID'/g" "$file" > "$tmpfile"
    
    # 第二步：替换 ${tenant_id} -> 'default'
    sed -i "s/\${tenant_id}/'$TENANT_ID'/g" "$tmpfile"
    
    # 执行 SQL
    cat "$tmpfile" | docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME 2>&1 | grep -E "ERROR|WARN|CREATE|INSERT|UPDATE|ALTER|DROP|DELETE" | head -10 || true
    
    # 清理临时文件
    rm -f "$tmpfile"
}

# 按顺序执行所有迁移脚本
run_migrations() {
    local migration_dir="$1"
    
    log_info "迁移目录: $migration_dir"
    
    # 获取所有 V*.sql 文件并按版本排序
    local files=$(ls -1 "$migration_dir"/V*.sql 2>/dev/null | sort)
    
    if [ -z "$files" ]; then
        log_error "未找到迁移文件"
        return 1
    fi
    
    local total=$(echo "$files" | wc -l)
    local current=0
    
    for file in $files; do
        current=$((current + 1))
        log_info "[$current/$total] $(basename $file)"
        process_sql_file "$file"
    done
}

# 验证数据
verify_data() {
    log_info "验证数据..."
    docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -c "
        SELECT 'sys_user' as table_name, count(*) as count FROM $SCHEMA_NAME.sys_user
        UNION ALL SELECT 'sys_role', count(*) FROM $SCHEMA_NAME.sys_role
        UNION ALL SELECT 'student_profile', count(*) FROM $SCHEMA_NAME.student_profile
        UNION ALL SELECT 'org_unit', count(*) FROM $SCHEMA_NAME.org_unit;
    " 2>/dev/null || log_warn "部分表可能不存在"
}

# 主函数
main() {
    log_info "开始初始化租户数据..."
    log_info "租户ID: $TENANT_ID, Schema: $SCHEMA_NAME"
    
    # 查找迁移目录
    local migration_dir=""
    if [ -d "xg-backend/xg-app/src/main/resources/db/migration/tenant" ]; then
        migration_dir="xg-backend/xg-app/src/main/resources/db/migration/tenant"
    elif [ -d "/data/xg-prototype/xg-backend/xg-app/src/main/resources/db/migration/tenant" ]; then
        migration_dir="/data/xg-prototype/xg-backend/xg-app/src/main/resources/db/migration/tenant"
    else
        # 尝试查找
        migration_dir=$(find . -path "*/db/migration/tenant" -type d 2>/dev/null | head -1)
    fi
    
    if [ -z "$migration_dir" ] || [ ! -d "$migration_dir" ]; then
        log_error "找不到迁移目录"
        exit 1
    fi
    
    log_info "迁移目录: $migration_dir"
    
    # 执行
    create_schema
    run_migrations "$migration_dir"
    verify_data
    
    log_info "初始化完成！"
    log_info "测试登录: curl -X POST http://localhost:8080/api/v1/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"stu_zhang\",\"password\":\"xg@123456\",\"tenant_id\":\"default\"}'"
}

# 运行
main "$@"
