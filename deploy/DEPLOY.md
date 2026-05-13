# 云服务器部署指南（精简版）

适用于 CentOS 7.9 云服务器的快速部署。

## 快速开始

### 1. 登录服务器并安装 Docker

```bash
ssh root@你的服务器IP

# 下载并运行 Docker 安装脚本
curl -fsSL https://your-repo/deploy/scripts/install-docker-centos7.sh | bash
```

### 2. 克隆项目

```bash
cd /opt
git clone https://your-git-repo/xg-prototype.git
cd xg-prototype/deploy
```

### 3. 配置环境

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置（务必修改所有密码）
vim .env
```

**⚠️ 重要**：必须修改 `SUPERADMIN_INITIAL_PASSWORD`，这是超级管理员的初始密码（用户名：admin）。如果不设置，服务将拒绝启动。

### 4. 启动服务

#### 方式一：使用一键部署脚本（推荐）--todo 后续要检查一下这个脚本

```bash
cd /opt/xg-prototype/deploy
./scripts/deploy.sh
# 按提示输入配置，自动完成日志初始化
```

#### 方式二：手动启动（需额外初始化日志）

```bash
cd /opt/xg-prototype/deploy

# 先执行日志初始化（重要！）
./scripts/setup-logs.sh

# 再启动服务
# 轻量模式（4核8G推荐）
docker compose --profile lite up -d --build

# 标准模式（8核16G推荐，含监控）
docker compose --profile full up -d --build
```

> **命令详解：**
>
> ```sh
> docker compose --profile lite up -d --build
> │             │              │   │     │
> │             │              │   │     └─ 强制重新构建镜像（有 build: 字段的 service）
> │             │              │   └────── detached：后台运行，不阻塞终端
> │             │              └────────── 子命令：创建并启动容器
> │             └───────────────────────── 启用 lite profile（profile 机制下面详讲）
> └─────────────────────────────────────── docker compose v2 写法（v1 是 docker-compose）
> ```
>
> **项目的 profile 分布**
>
> | Service          | profile 字段      | `--profile lite` | `--profile full` | 不带 profile |
> | :--------------- | :---------------- | :--------------: | :--------------: | :----------: |
> | `postgres`       | 无                |        ✅         |        ✅         |      ✅       |
> | `redis`          | 无                |        ✅         |        ✅         |      ✅       |
> | `minio`          | 无                |        ✅         |        ✅         |      ✅       |
> | `xg-java`        | `["lite","full"]` |        ✅         |        ✅         |      ❌       |
> | `xg-python`      | `["lite","full"]` |        ✅         |        ✅         |      ❌       |
> | `xg-web-builder` | `["lite","full"]` |        ✅         |        ✅         |      ❌       |
> | `nginx`          | `["lite","full"]` |        ✅         |        ✅         |      ❌       |
> | `prometheus`     | `["full"]`        |        ❌         |        ✅         |      ❌       |
> | `grafana`        | `["full"]`        |        ❌         |        ✅         |      ❌       |





### 5. 验证部署

```bash
# 查看状态
docker compose ps

# 访问测试
curl http://localhost/health
curl http://localhost:8080/actuator/health
```

## 更新代码

```bash
cd /opt/xg-prototype

# 拉取最新代码
git pull

# 运行更新脚本（自动重新构建、部署和配置日志）
./deploy/scripts/update.sh
```

或使用快捷命令：

```bash
./deploy/scripts/update.sh -p lite    # 轻量模式
./deploy/scripts/update.sh -p full    # 标准模式
./deploy/scripts/update.sh -n         # 无缓存构建（完全重建）
```

## 一键部署脚本（可选）

项目提供了交互式部署脚本，自动完成所有步骤：

```bash
cd /opt/xg-prototype/deploy
./scripts/deploy.sh
```

按提示输入 Git 仓库地址和其他配置即可自动完成部署。

## 目录结构

```
deploy/
├── docker-compose.yml      # 主编排文件
├── .env.example           # 环境变量模板
├── nginx/                 # Nginx 配置
│   ├── nginx.conf
│   └── conf.d/
├── scripts/               # 部署脚本
│   ├── install-docker-centos7.sh  # Docker 安装
│   ├── deploy.sh                  # 一键部署
│   └── update.sh                  # 代码更新
└── docs/
    └── centos7-deployment.md      # 详细文档
```

## 常用命令

```bash
# 查看日志
docker compose logs -f
docker compose logs -f xg-java

# 重启服务
docker compose --profile lite restart

# 停止服务
docker compose --profile lite down

# 进入容器
docker exec -it xg-java sh
docker exec -it xg-postgres psql -U postgres -d xg1

# 查看资源占用
docker stats
```

## 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| Web 应用 | http://服务器IP | 主应用入口 |
| MinIO 控制台 | http://服务器IP:9001 | 文件存储 |
| Java API | http://服务器IP:8080 | 后端 API |
| Python AI | http://服务器IP:8000 | AI Sidecar |
| Grafana | http://服务器IP:3000 | 监控（仅 full 模式） |

## 注意事项

1. **CentOS 7.9 已停止维护**，建议后续考虑升级到 Rocky Linux/AlmaLinux 8+
2. **防火墙配置**：确保开放 80、443、9000、9001 端口
3. **数据备份**：定期备份 PostgreSQL 和 MinIO 数据
4. **SSL 证书**：生产环境建议配置 HTTPS

## 故障排查

```bash
# 查看服务日志
docker compose logs xg-java | tail -50
docker compose logs xg-python | tail -50

# 检查端口占用
netstat -tlnp | grep -E '80|8080|8000'

# 重启单个服务
docker compose restart xg-java

# 清理并重建
docker compose --profile lite down
docker compose --profile lite up -d --build --no-cache
```

更多详情请查看 `docs/centos7-deployment.md`
