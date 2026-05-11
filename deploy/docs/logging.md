# 日志配置指南

本项目已将所有服务的日志映射到宿主机的 `/data/logs` 目录，并配置了日志轮转。

## 日志目录结构

```
/data/logs/
├── java/           # Java 后端服务日志
│   └── application.log
├── python/         # Python AI 服务日志
│   └── application.log
├── nginx/          # Nginx 访问和错误日志
│   ├── access.log
│   └── error.log
├── postgres/       # PostgreSQL 日志
│   └── postgresql-YYYY-MM-DD_HHMMSS.log
├── redis/          # Redis 日志（stdout，通过 Docker 查看）
└── minio/          # MinIO 日志（stdout，通过 Docker 查看）
```

## 查看日志方法

### 方法 1：直接查看日志文件（推荐）

```bash
# Java 服务日志
tail -f /data/logs/java/application.log

# Python 服务日志
tail -f /data/logs/python/application.log

# Nginx 访问日志
tail -f /data/logs/nginx/access.log

# Nginx 错误日志
tail -f /data/logs/nginx/error.log

# PostgreSQL 日志
tail -f /data/logs/postgres/postgresql-*.log
```

### 方法 2：使用 Docker 命令

```bash
cd /opt/xg-prototype/deploy

# Java 服务
docker compose logs -f xg-java

# Python 服务
docker compose logs -f xg-python

# Nginx
docker compose logs -f nginx

# PostgreSQL
docker compose logs -f postgres

# Redis
docker compose logs -f redis

# 所有服务
docker compose logs -f
```

## 日志轮转配置

### 自动轮转（logrotate）

已在 `/etc/logrotate.d/xg-services` 配置日志轮转：

| 服务 | 检查周期 | 保留天数 | 触发大小 | 压缩 |
|------|----------|----------|----------|------|
| Java | 每日 | **7 天** | **100MB** | 是 |
| Python | 每日 | **7 天** | **100MB** | 是 |
| Nginx | 每日 | **7 天** | **100MB** | 是 |
| PostgreSQL | 每日 | **7 天** | **50MB** | 是 |

**轮转规则**：
- 每天检查一次，但**超过指定大小（100MB）会立即轮转打包**，不等到第二天
- 小于 1MB 的文件不轮转（避免空文件打包）
- 保留最近 7 个历史文件（约 7 天）
- 轮转后自动压缩为 `.gz` 格式

### 手动执行轮转

```bash
# 测试配置（不实际执行）
logrotate -d /etc/logrotate.d/xg-services

# 强制执行轮转
logrotate -f /etc/logrotate.d/xg-services
```

### 验证 logrotate 状态

```bash
# 查看 logrotate 定时任务状态
systemctl status crond

# 查看最近一次的 logrotate 记录
cat /var/lib/logrotate/logrotate.status | grep xg
```

## Docker 日志驱动配置

各服务 Docker 日志驱动配置：

| 服务 | 驱动 | 单文件大小 | 保留文件数 |
|------|------|-----------|-----------|
| xg-java | local | 10MB | 3 |
| xg-python | local | 10MB | 3 |
| nginx | local | 10MB | 3 |
| postgres | local | 10MB | 3 |
| redis | local | 5MB | 3 |
| minio | local | 5MB | 3 |

**注意**：即使配置了日志文件映射，Docker 仍会收集 stdout 日志作为备份。这些日志存储在 Docker 管理的目录中，大小受限不会无限增长。

## 日志级别调整

### Java 服务

在 `.env` 文件中添加：

```bash
# 可选: DEBUG, INFO, WARN, ERROR
LOGGING_LEVEL_ROOT=INFO
```

### Python 服务

在 `.env` 文件中添加：

```bash
# 可选: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL=INFO
```

修改后重启服务：

```bash
docker compose --profile lite restart xg-java xg-python
```

## 日志清理

### 手动清理旧日志

```bash
# 删除 30 天前的日志
find /data/logs -name "*.log" -mtime +30 -delete
find /data/logs -name "*.log.gz" -mtime +30 -delete

# 清空当前日志（谨慎操作）
> /data/logs/java/application.log
> /data/logs/python/application.log
> /data/logs/nginx/access.log
> /data/logs/nginx/error.log
```

### 清理 Docker 日志

```bash
# 清理所有停止的容器日志
docker system prune -f

# 清空特定容器的日志
echo "" > $(docker inspect --format='{{.LogPath}}' xg-java)
```

## 日志分析示例

```bash
# 统计 Nginx 访问量前 10 的 IP
cat /data/logs/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -10

# 查找 Java 错误日志
grep -i "error\|exception" /data/logs/java/application.log

# 统计 Python 服务 HTTP 状态码
cat /data/logs/python/application.log | grep -oP 'HTTP/\d\.\d" \K\d{3}' | sort | uniq -c

# 查看 PostgreSQL 慢查询（已配置记录 >1000ms 的查询）
grep "duration:" /data/logs/postgres/postgresql-*.log | tail -20
```

## 故障排查

### 日志文件不生成

```bash
# 检查目录权限
ls -la /data/logs/

# 检查目录所有者（PostgreSQL 需要特殊权限）
chown -R 999:999 /data/logs/postgres  # postgres 容器用户
```

### logrotate 不工作

```bash
# 检查 crond 是否运行
systemctl status crond
systemctl enable crond

# 手动测试 logrotate
logrotate -v /etc/logrotate.d/xg-services

# 检查日志
cat /var/log/cron | grep logrotate
```

### Docker 日志过大

```bash
# 查看日志大小
du -sh /var/lib/docker/containers/*

# 限制容器日志大小（已在 docker-compose.yml 配置）
docker compose --profile lite up -d --no-deps xg-java
```

## 集中式日志方案（可选）

如需更强大的日志管理，可考虑：

1. **ELK Stack**：Elasticsearch + Logstash + Kibana
2. **Grafana Loki**：轻量级日志聚合
3. **Fluentd/Fluent Bit**：日志收集转发

本项目已在 `full` profile 中包含 Grafana，可配合 Loki 实现日志可视化。
