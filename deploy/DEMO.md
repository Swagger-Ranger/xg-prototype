# 演示环境快速使用指南

专为演示/原型场景优化，降低资源占用，提升启动速度。

## 演示环境配置特点

| 配置项 | 标准环境 | 演示环境 |
|--------|---------|---------|
| Java 内存 | 2GB | 512MB |
| Python 内存 | 512MB | 256MB |
| PostgreSQL 内存 | 1GB | 512MB |
| Redis 内存 | 256MB | 128MB |
| MinIO 内存 | 256MB | 128MB |
| **总内存占用** | ~3.5GB | **~2GB** |

## 首次启动（仅需一次）

```bash
cd /opt/xg-prototype/deploy

# 使用演示环境配置启动
./scripts/update.sh --demo -p lite
```

这会：
1. 使用 `.env.demo` 配置（低内存、快速启动）
2. 构建 Java 和 Python 服务
3. 启动所有服务

等待构建完成（首次约 3-5 分钟）。

## 日常使用（演示环境）

### 快速重启（秒级，推荐）

```bash
./scripts/update.sh -q
# 或
./scripts/update.sh --quick
```

**特点**：
- 不拉取代码
- 不重新构建
- 只重启容器（秒级完成）

### 更新代码（智能重建）

```bash
cd /opt/xg-prototype
git pull
./scripts/update.sh
```

**智能检测**：
- Java 代码变更 → 只重建 Java 服务
- Python 代码变更 → 只重建 Python 服务
- 配置变更 → 重建相关服务
- 无变更 → 直接重启（不重建）

### 强制重新构建

```bash
./scripts/update.sh -n
# 或
./scripts/update.sh --no-cache
```

## 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志（Java）
tail -f /data/logs/java/application.log

# 查看日志（Python）
tail -f /data/logs/python/application.log

# 快速重启单个服务
docker compose restart xg-java

# 停止所有服务
docker compose --profile lite down

# 使用演示配置重新启动
docker compose --profile lite up -d
```

## 快速更新流程（日常使用）

```bash
cd /opt/xg-prototype

# 1. 拉取最新代码
git pull

# 2. 智能更新（自动判断是否需要重建）
./deploy/scripts/update.sh

# 如果提示"代码未变更，使用快速模式"，则直接完成
# 如果需要重建，会自动进行，无需干预
```

## 从标准环境切换到演示环境

```bash
cd /opt/xg-prototype/deploy

# 1. 停止当前服务
docker compose --profile lite down

# 2. 使用演示配置启动
./scripts/update.sh --demo -p lite

# 注意：演示环境使用更少的内存，适合 4核4G 服务器
```

## 故障排查

### 服务启动失败

```bash
# 查看日志
docker logs xg-java 2>&1 | tail -30
docker logs xg-python 2>&1 | tail -30

# 检查内存使用（演示环境内存紧张）
free -h
docker stats --no-stream
```

### 构建太慢

```bash
# 跳过测试（已默认配置）
# 或者使用已有的镜像（如果构建过）
docker compose --profile lite up -d
```

### 日志目录未创建

```bash
./scripts/setup-logs.sh
```

## 注意事项

1. **演示环境配置较低**，不建议用于生产环境
2. **首次构建需要时间**，请耐心等待（可看到进度输出）
3. **后续更新很快**，使用 `-q` 参数秒级重启
4. **自动检测代码变更**，无需手动判断是否需要重建

## 资源占用对比

在 4核4G 云服务器上测试：

```bash
# 演示环境内存占用
$ docker stats --no-stream
CONTAINER ID   NAME         MEM USAGE / LIMIT
xg-java        450MiB / 1GiB
xg-python      180MiB / 256MiB
xg-postgres    200MiB / 512MiB
xg-redis       10MiB / 128MiB
xg-minio       50MiB / 128MiB
xg-nginx       5MiB / 128MiB
```

总占用约 **900MB**，剩余内存可用于系统和其他进程。
