# 演示环境快速使用指南

专为演示/原型场景优化的 Docker 部署方案，支持本地开发（无 Docker）+ 服务器 Docker 部署的无缝衔接。

## 核心特性

- ✅ **智能更新**：自动检测前后端代码变更，只重建变更部分
- ✅ **前端自动构建**：服务器使用 Docker 构建前端，无需安装 Node.js
- ✅ **本地开发友好**：本地使用 vibe coding，修改后 push 即可更新
- ✅ **资源优化**：演示环境 2GB 内存即可运行

## 环境说明

| 环境 | 开发方式 | 部署方式 |
|------|---------|---------|
| 本地开发 | Vite + Node.js（直接运行） | 无 Docker |
| 服务器 | - | Docker Compose |

## 部署架构

```
本地开发 (xg-frontend/, xg-backend/, xg-ai/)
    ↓ git push
Git 仓库
    ↓ git pull
服务器 (Docker)
    ├── xg-java (Spring Boot) ← xg-backend/ 代码构建
    ├── xg-python (FastAPI) ← xg-ai/ 代码构建
    ├── xg-web-builder ← xg-frontend/ 代码 Docker 构建
    └── nginx ← 挂载前端构建产物
```

## 快速开始

### 首次部署（服务器执行）

```bash
cd /opt/xg-prototype/deploy

# 使用演示环境配置启动
./scripts/update.sh --demo -p lite
```

首次部署流程：
1. 拉取代码
2. 构建 Java 后端
3. 构建 Python AI
4. **Docker 构建前端**（自动完成，无需手动装 Node.js）
5. 启动所有服务

耗时：约 5-8 分钟（主要是首次构建下载依赖）

### 日常使用

#### 场景 1：本地修改代码后更新到服务器

**本地操作（无 Docker）：**
```bash
# 修改代码后
git add .
git commit -m "fix: xxx"
git push origin main
```

**服务器操作：**
```bash
cd /opt/xg-prototype

# 1. 拉取最新代码
git pull

# 2. 智能更新（自动检测变更并重建）
./deploy/scripts/update.sh
```

脚本会自动检测：
- `xg-backend/` 有变更 → 重建 Java 服务
- `xg-ai/` 有变更 → 重建 Python 服务
- `xg-frontend/` 有变更 → **Docker 自动构建前端**

#### 场景 2：快速重启（不重建）

```bash
./scripts/update.sh -q
```

适用：配置调整、服务重启，秒级完成。

#### 场景 3：强制重新构建

```bash
./scripts/update.sh -n
```

适用：依赖更新、Dockerfile 变更等情况。

## 本地开发指南

### 前端开发

```bash
cd xg-frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev:web

# 构建（本地测试用，服务器会自动构建）
pnpm run build --filter=@xg1/web
```

开发服务器默认地址：http://localhost:5173

### 后端开发（Java）

```bash
cd xg-backend

# 使用 Gradle 运行
./gradlew :xg-app:bootRun
```

### 后端开发（Python AI）

```bash
cd xg-ai

# 安装依赖
pip install -e ".[dev]"

# 启动服务
uvicorn app.main:app --reload --port 8000
```

## 更新流程详解

### 智能检测机制

update.sh 会记录上次部署的 commit，对比本次拉取的代码：

```bash
# 示例输出
[INFO] 检测到代码变更: a1b2c3d → d4e5f6g
[INFO] Java 后端代码有变更，需要重建
[INFO] 前端代码有变更，需要重新构建
[INFO] 仅构建 Java 服务...
[INFO] 构建前端...
```

### 前端构建原理

服务器不需要安装 Node.js，使用 Docker 构建：

1. 创建临时的 Node.js 容器
2. 在容器中 `pnpm install` 和 `pnpm run build`
3. 构建产物（`dist/`）输出到 Docker 卷
4. Nginx 挂载该卷提供服务

构建过程全自动，无需人工干预。

## 目录结构说明

```
xg-prototype/
├── xg-backend/          # Java 后端代码
│   └── xg-app/
│       └── src/
├── xg-frontend/         # 前端代码（本地开发用）
│   └── apps/web/
│       └── src/
├── xg-ai/               # Python AI 代码
│   └── app/
└── deploy/              # 部署配置
    ├── docker-compose.yml
    ├── Dockerfile.java
    ├── Dockerfile.python
    ├── Dockerfile.web    # 前端构建 Dockerfile
    └── scripts/
        └── update.sh     # 智能更新脚本
```

## 常用命令

```bash
cd /opt/xg-prototype/deploy

# 查看服务状态
docker compose ps

# 查看日志（Java）
tail -f /data/logs/java/application.log

# 查看日志（前端访问日志）
tail -f /data/logs/nginx/access.log

# 重启单个服务
docker compose restart xg-java

# 停止所有服务
docker compose --profile lite down

# 进入容器调试
docker exec -it xg-java sh
docker exec -it xg-python bash
```

## 故障排查

### 前端没有更新

```bash
# 检查 web_dist 卷内容（卷名前缀依赖 docker compose 项目名，一般是 deploy_web_dist）
docker volume ls | grep web_dist
docker run --rm -v deploy_web_dist:/output alpine ls -la /output

# 手动触发前端构建（强制重新复制构建产物到 web_dist 卷）
docker compose --profile lite run --rm xg-web-builder
```

### 构建太慢/卡死

```bash
# 清理 Docker 缓存
docker system prune -f

# 使用国内镜像加速
# 编辑 /etc/docker/daemon.json 添加加速器
```

### 服务无法启动

```bash
# 查看详细日志
docker logs xg-java
docker logs xg-python
docker logs xg-nginx

# 检查端口占用
netstat -tlnp | grep -E '80|8080|8000'
```

## 注意事项

1. **首次构建较慢**：需要下载依赖和构建，请耐心等待
2. **后续更新很快**：智能检测只重建变更部分，通常 1-3 分钟
3. **前端构建在 Docker 中**：服务器不需要 Node.js，完全隔离
4. **本地开发和服务器部署解耦**：本地任意修改，push 后服务器自动更新
5. **演示环境内存限制**：如果服务 OOM，请检查 `.env.demo` 中的内存配置

## 完整更新示例

```bash
# 本地（开发者）
$ cd xg-frontend
$ vim apps/web/src/pages/login/index.tsx  # 修改登录页
$ git add . && git commit -m "ui: 优化登录页面" && git push

# 服务器（自动更新）
$ cd /opt/xg-prototype
$ git pull
$ ./deploy/scripts/update.sh
[INFO] 检测到代码变更: 8f7e6d5 → 2a3b4c5
[INFO] 前端代码有变更，需要重新构建
[INFO] 构建前端...
... (约 2 分钟)
[INFO] 前端构建完成
[INFO] 快速重启服务...
✅ 更新完成！

# 访问 http://服务器IP/ 查看更新后的登录页
```

这样就完成了从本地开发到服务器部署的全流程！
