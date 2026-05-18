# 云服务器部署指南（精简版）

适用于 CentOS 7.9 云服务器的快速部署。

## 部署架构（重要变更 2026-05）

**不再在云主机上构建源码**。云主机只需要装 docker，所有镜像和前端 dist 在本地 Mac 上构建好，scp 上去。

```
[本地 Mac arm64]                          [云主机 x86_64]
─────────────                            ───────────────
代码改动
  ↓
build-local.sh                            装 docker 即可
  ├─ buildx 交叉编译 amd64 镜像
  ├─ docker save | gzip → dist/images/
  └─ pnpm build         → dist/web-dist/
  ↓
sync-to-cloud.sh         ─── rsync ───→  /opt/xg-prototype/deploy/
                                            ↓
                                         update.sh
                                            ├─ docker load *.tar.gz
                                            └─ docker compose up -d --no-build
```

云主机**无需** JDK / Python / Node / gradle / pnpm 等任何编译工具链。

> **本地开发不受影响**：`docker compose up -d --build` 仍然能直接在开发机上拉起整套服务（含 `xg-web-builder` oneshot 构建前端）。新流程是叠加在 base compose 上的一个 `docker-compose.prod.yml` 覆盖文件，**仅在云上**生效——本地开发完全沿用原来的工作流。详见下方"本地开发模式"。

## 本地开发模式（开发机）

如果你是本地开发者、要在自己的机器上拉起整套环境，**和以前一样**：

```bash
cd deploy
cp .env.example .env                              # 首次
docker compose --profile lite up -d --build       # 构建并启动
```

- `xg-java` / `xg-python` 在本地 build（Mac arm64 → arm64，Linux x86 → x86，原生架构）
- `xg-web-builder` 用 `Dockerfile.web` 把前端 build 出来，写到 `deploy/web-dist/`
- `nginx` 通过 bind mount 从 `deploy/web-dist/` 读取前端

> 本地开发**不要**带 `-f docker-compose.prod.yml`——prod 覆盖文件是云部署专用的，会跳过前端构建，本地用了会得到空白页。

## 云部署快速开始

### 一、云主机准备（仅一次）

```bash
ssh root@你的服务器IP

# 安装 Docker（CentOS 7.9）
curl -fsSL https://your-repo/deploy/scripts/install-docker-centos7.sh | bash

# 预创建目录
mkdir -p /opt/xg-prototype/deploy
```

### 二、本地 Mac 配置（仅一次）

```bash
# 1. 安装 pnpm (前端构建用)
npm install -g pnpm@9.1.0

# 2. 启用 buildx (Docker Desktop 默认已开)
docker buildx version    # 验证

# 3. 配置云主机连接
cat > deploy/.env.deploy <<EOF
CLOUD_HOST=你的服务器IP
CLOUD_USER=root
CLOUD_PATH=/opt/xg-prototype
# CLOUD_PORT=22
# CLOUD_SSH_KEY=~/.ssh/id_rsa
EOF
```

### 三、首次部署

**本地 Mac**：
```bash
# 1. 构建（约 5-10 min, 含交叉编译 + 前端构建）
./deploy/scripts/build-local.sh
# 末尾会打印 IMAGE_TAG，例如: a3f1b2c

# 2. 同步到云主机
./deploy/scripts/sync-to-cloud.sh
```

**云主机**：
```bash
cd /opt/xg-prototype/deploy

# 1. 配置环境变量（首次）
cp .env.example .env
vim .env
#   → IMAGE_TAG=a3f1b2c                (改成 build 输出的 tag)
#   → SUPERADMIN_INITIAL_PASSWORD=...  (必改!)
#   → DB_PASS / REDIS_PASS / ...

# 2. 初始化日志目录（首次）
./scripts/setup-logs.sh

# 3. 加载镜像 + 启动
./scripts/update.sh                # 默认 lite
# 或: ./scripts/update.sh -f       # full 含监控
```

**⚠️ 重要**：必须修改 `.env` 中的 `SUPERADMIN_INITIAL_PASSWORD`（超管初始密码，用户名 admin），未设置时服务会拒绝启动。

> **profile 分布**
>
> | Service      | profile 字段      | `--profile lite` | `--profile full` |
> | :----------- | :---------------- | :--------------: | :--------------: |
> | `postgres`   | 无                |        ✅         |        ✅         |
> | `redis`      | 无                |        ✅         |        ✅         |
> | `minio`      | 无                |        ✅         |        ✅         |
> | `xg-java`    | `["lite","full"]` |        ✅         |        ✅         |
> | `xg-python`  | `["lite","full"]` |        ✅         |        ✅         |
> | `nginx`      | `["lite","full"]` |        ✅         |        ✅         |
> | `prometheus` | `["full"]`        |        ❌         |        ✅         |
> | `grafana`    | `["full"]`        |        ❌         |        ✅         |


### 5. 验证部署

```bash
# 查看状态
docker compose ps

# 访问测试
curl http://localhost/health
curl http://localhost:8080/actuator/health
```

## 代码更新流程

代码改动后的标准三步：

**本地 Mac**：
```bash
# 改完代码后
./deploy/scripts/build-local.sh                     # 全部重建
# 或选择性重建:
./deploy/scripts/build-local.sh --services java     # 只改了 Java
./deploy/scripts/build-local.sh --services java,web # Java + 前端

./deploy/scripts/sync-to-cloud.sh                   # 同步
```

**云主机**：
```bash
cd /opt/xg-prototype/deploy
vim .env                            # 把 IMAGE_TAG 改为新 tag (build 末尾会打印)
./scripts/update.sh                 # 加载新镜像 + 重启 + 健康检查
# 或: ./scripts/update.sh -q        # 快速重启 (不加载新镜像，仅 restart)
```

### 回滚

旧镜像 `docker images xg-java` 仍在云上，回滚只需改 `.env` 的 `IMAGE_TAG` 为旧版本，重跑 `./scripts/update.sh` 即可。

## 目录结构

```
deploy/
├── docker-compose.yml                  # 主编排 (本地开发默认入口，含 build:+image:)
├── docker-compose.prod.yml             # 云部署覆盖 (仅 disable xg-web-builder)
├── docker-compose.dev.yml              # 本地开发覆盖 (仅基础设施, 应用本机跑)
├── .env.example                        # 环境变量模板 (含 IMAGE_TAG / WEB_DIST_DIR)
├── .env.deploy                         # 云主机连接信息 (本地用, git 忽略)
├── Dockerfile.java                     # 本地 buildx 用
├── Dockerfile.python                   # 本地 buildx 用
├── Dockerfile.web                      # [DEPRECATED] 前端改本地 pnpm build
├── nginx/ init-db/ prometheus/ ...     # 配置目录
├── dist/                               # build-local.sh 产出 (git 忽略)
│   ├── images/xg-java-<tag>.tar.gz
│   ├── images/xg-python-<tag>.tar.gz
│   ├── web-dist/                       # nginx bind mount
│   └── MANIFEST.txt
└── scripts/
    ├── build-local.sh                  # [本地] 交叉编译 + 打包
    ├── sync-to-cloud.sh                # [本地] rsync 到云
    ├── load-and-up.sh                  # [云上] 加载镜像 + 起服务
    ├── update.sh                       # [云上] 入口 (调用 load-and-up + 健康检查)
    ├── install-docker-centos7.sh       # [云上] 首次装 docker
    └── setup-logs.sh                   # [云上] 首次建日志目录
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

# 清理并重启 (镜像在本地构建, 云上不 build)
docker compose --profile lite down
docker compose --profile lite up -d --no-build

# 镜像丢了 (被 docker prune 误清), 重新加载
./scripts/load-and-up.sh

# 想确认在跑的镜像版本
docker inspect xg-java --format '{{.Config.Image}}'
```

## 本地开发（macOS / Docker Desktop）

云服务器（Linux）上 `/data/logs` 可直接绑定挂载；**macOS 不行** —— Docker Desktop
只允许从「File Sharing」根（默认 `/Users`、`/Volumes`、`/private`、`/tmp`）做绑定挂载。
`docker-compose.yml` 的 `${HOST_LOG_DIR:-/data/logs}/...` 与 `./init-db` 一旦解析到
非共享路径（如 `/data/logs`、或从小写 `/users/...` 目录启动），容器会报
`mounts denied: ... not shared from the host` 起不来。

**一次性配置**：项目根创建 `deploy/.env`（已 gitignore，机器私有），把日志目录
指到共享根下的绝对路径，并建好子目录：

```bash
echo 'HOST_LOG_DIR=/Users/<你>/xg1/deploy/logs' > /Users/<你>/xg1/deploy/.env
mkdir -p /Users/<你>/xg1/deploy/logs/postgres /Users/<你>/xg1/deploy/logs/java
```

**启动 / 重建命令**（`-f` 用绝对**大写** `/Users` 路径，避免 `./init-db` 落到小写
`/users`；`--project-name deploy` 必须保留，否则不复用既有 `deploy_*` 数据卷会"丢数据"）：

```bash
docker compose -f /Users/<你>/xg1/deploy/docker-compose.yml \
  --project-directory /Users/<你>/xg1/deploy --project-name deploy \
  up -d --build xg-java          # 只重建后端；postgres/redis 不动加 --no-deps
```

> 数据在命名卷 `deploy_pg_data` 上，`up`/`recreate` 不会删卷；只要项目名仍是
> `deploy`，重建容器不丢库。改了后端代码后用上面命令重建 `xg-java`，
> `TenantMigrationRunner` 启动会自动补跑新增的 `db/migration/tenant/V*.sql`。

更多详情请查看 `docs/centos7-deployment.md`
