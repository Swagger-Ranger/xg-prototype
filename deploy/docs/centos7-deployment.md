# CentOS 7.9 云服务器部署指南

## 系统要求

| 配置 | 建议 |
|------|------|
| CPU | 4核+ |
| 内存 | 8GB+（轻量模式）/ 16GB+（标准模式） |
| 磁盘 | 50GB+ SSD |
| 网络 | 开放 80、443、9000、9001 端口 |

## 一、服务器初始化

### 1.1 连接服务器并更新系统

```bash
ssh root@your-server-ip

# 更新系统
yum update -y

# 安装必要工具
yum install -y wget curl vim git net-tools
```

### 1.2 安装 Docker（CentOS 7.9 专用步骤）

CentOS 7.9 默认源中的 Docker 版本过旧，需要手动安装：

```bash
# 移除旧版本（如有）
yum remove -y docker docker-client docker-client-latest docker-common \
    docker-latest docker-latest-logrotate docker-logrotate docker-engine

# 安装依赖
yum install -y yum-utils device-mapper-persistent-data lvm2

# 添加 Docker 官方源
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker CE 最新版
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 启动 Docker
systemctl start docker
systemctl enable docker

# 验证安装
docker --version
docker compose version
```

### 1.3 配置 Docker 镜像加速（推荐）

```bash
# 创建 Docker 配置目录
mkdir -p /etc/docker

# 配置阿里云镜像加速（推荐）
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
EOF

# 重启 Docker
systemctl daemon-reload
systemctl restart docker
```

## 二、项目部署

### 2.1 克隆项目

```bash
# 选择部署目录，建议使用 /opt 或 /data
mkdir -p /opt

cd /opt

# 克隆项目（替换为实际仓库地址）
git clone https://your-git-repo/xg-prototype.git

cd xg-prototype/deploy
```

### 2.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量（修改密码和 API Key）
vim .env
```

`.env` 文件示例（生产环境建议修改默认值）：

```bash
# Database
DB_PASS=your-strong-password-here

# Redis
REDIS_PASS=your-strong-password-here

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=your-strong-password-here

# AI 内部通信密钥（必须修改）
AI_INTERNAL_TOKEN=your-random-token-here-at-least-32-chars

# 超级管理员初始密码（生产环境必须修改，不设置则无法启动）
# 用户名: admin
SUPERADMIN_INITIAL_PASSWORD=admin123456

# LLM API Keys（可选，不配置则 AI 功能不可用）
QWEN_API_KEY=your-qwen-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key

# Grafana（仅 full profile）
GRAFANA_PASS=your-admin-password
```

### 2.3 启动服务

根据服务器配置选择模式：

**轻量模式（推荐 4核8G）**：
```bash
docker compose --profile lite up -d --build
```

**标准模式（推荐 8核16G，含监控）**：
```bash
docker compose --profile full up -d --build
```

### 2.4 查看启动状态

```bash
# 查看所有容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f xg-java
```

## 三、验证部署

### 3.1 服务访问

| 服务 | 地址 | 说明 |
|------|------|------|
| Web 应用 | http://服务器IP | 主应用入口 |
| MinIO 控制台 | http://服务器IP:9001 | 文件存储管理 |
| Java API | http://服务器IP:8080 | 后端 API |
| Python AI | http://服务器IP:8000 | AI Sidecar |

### 3.2 健康检查

```bash
# 检查 Nginx
curl http://localhost/health

# 检查 Java 后端
curl http://localhost:8080/actuator/health

# 检查 Python AI
curl http://localhost:8000/health
```

## 四、配置域名和 HTTPS（可选）

### 4.1 使用 Nginx 配置域名

编辑 `deploy/nginx/conf.d/default.conf`，修改 `server_name`：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改这里
    ...
}
```

然后重启 Nginx：
```bash
docker compose restart nginx
```

### 4.2 配置 HTTPS（使用 certbot）

```bash
# 安装 certbot
yum install -y certbot

# 申请证书
certbot certonly --standalone -d your-domain.com

# 配置证书到 Nginx（手动编辑 nginx.conf 或挂载证书目录）
```

## 五、日常维护

### 5.1 查看资源使用

```bash
# 查看容器资源占用
docker stats

# 查看磁盘使用
docker system df
```

### 5.2 备份数据

```bash
# 备份 PostgreSQL
docker exec xg-postgres pg_dump -U postgres xg1 > backup_$(date +%Y%m%d).sql

# 备份 MinIO 数据
cd /opt/xg-prototype/deploy
tar czf minio_backup_$(date +%Y%m%d).tar.gz /var/lib/docker/volumes/xg-prototype_minio_data
```

### 5.3 日志清理

```bash
# 清理旧日志（Docker 已配置自动轮转，如需手动清理）
docker system prune -f
```

## 六、故障排查

### 6.1 服务无法启动

```bash
# 检查端口占用
netstat -tlnp | grep -E '80|8080|8000'

# 检查日志定位问题
docker compose logs xg-java | tail -50
docker compose logs xg-python | tail -50
```

### 6.2 内存不足

如果服务器内存不足，编辑 `.env` 调小内存限制：

```bash
# Java 内存
JAVA_OPTS=-Xms256m -Xmx1g

# 容器内存限制
JAVA_MEM_LIMIT=1.5G
PYTHON_MEM_LIMIT=256M
PG_MEM_LIMIT=512M
```

### 6.3 重启服务

```bash
# 重启所有服务
docker compose --profile lite restart

# 重启单个服务
docker compose restart xg-java
```

## 七、更新代码

项目提供了更新脚本，使用 git pull 后自动重新构建和部署：

```bash
cd /opt/xg-prototype/deploy
./scripts/update.sh
```

或手动更新：

```bash
cd /opt/xg-prototype

# 拉取最新代码
git pull origin main

# 重新构建并启动
cd deploy
docker compose --profile lite up -d --build
```

## 八、安全建议

1. **修改默认密码**：生产环境务必修改所有默认密码
2. **防火墙配置**：仅开放必要的端口（80、443）
3. **定期更新**：及时更新系统补丁和 Docker 版本
4. **数据备份**：定期备份 PostgreSQL 和 MinIO 数据
5. **禁用 root 登录**：建议使用普通用户 + sudo 部署

## 快速命令参考

```bash
# 查看状态
docker compose ps
docker compose logs -f

# 启动/停止
docker compose --profile lite up -d
docker compose --profile lite down

# 重启
docker compose --profile lite restart

# 更新
git pull && docker compose --profile lite up -d --build

# 进入容器
docker exec -it xg-java sh
docker exec -it xg-postgres psql -U postgres
```
