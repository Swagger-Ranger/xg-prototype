# 运维 Runbook

> 给运维 / 值班同学的速查。**只描述当前实际能跑起来的命令**，不解释架构。
> 架构图谱见 `docs/architecture.md`。

## 1. 环境一眼

| 服务 | 默认端口 | 健康检查 | 启动命令 |
|---|---|---|---|
| PostgreSQL 15 | 5432 | `pg_isready` | docker compose 起 |
| Redis | 6379 | `redis-cli ping` | docker compose 起 |
| MinIO | 9000 / 9001 | `/minio/health/live` | docker compose 起 |
| Java 主服务 | 8080 | `GET /actuator/health` | `./gradlew :xg-app:bootRun` |
| Python AI Sidecar | 8001 | `GET /health` | `python -m app`（venv 内） |
| Web 管理端 | 5173（dev）/ 80（prod） | 静态资源 | `pnpm -C apps/web dev` / build 后 nginx |
| Mini 小程序 | — | — | `pnpm -C apps/mini dev:weapp` 后微信开发者工具加载 dist |

## 2. 三种 deploy 模式

`/deploy/docker-compose.yml` 顶部注释为权威。速记：

```bash
# 开发：仅起基础设施，应用本机跑
docker compose -f deploy/docker-compose.yml up -d postgres redis minio

# 轻量全栈（4 核 8G 演示机，约 3.5G 内存）
docker compose -f deploy/docker-compose.yml --profile lite up -d

# 标准全栈（8 核 16G 准生产，约 7.5G 内存）
docker compose -f deploy/docker-compose.yml --profile full up -d
```

## 3. 本地起服务

```bash
# 1) 数据库 / 缓存 / 对象存储
docker compose -f deploy/docker-compose.yml up -d postgres redis minio

# 2) Java 主服务（Spring profile = dev，跑 Flyway tenant migrations）
cd xg-backend
./gradlew :xg-app:bootRun --args='--spring.profiles.active=dev'

# 3) Python AI sidecar（端口 8001，host/port 来自 settings）
cd xg-ai
source .venv/bin/activate
python -m app

# 4) Web 管理端
cd xg-frontend/apps/web
pnpm install
pnpm dev          # http://localhost:5173

# 5) 小程序（先 nvm use 20，Taro 3.6 不兼容 Node 23+）
cd xg-frontend/apps/mini
nvm use 20
pnpm dev:weapp     # 然后用微信开发者工具打开 dist/
```

## 4. 健康检查脚本

```bash
# 一次性 ping 所有依赖（替换为实际域名）
curl -fsS http://localhost:8080/actuator/health | jq .status        # UP
curl -fsS http://localhost:8001/health                              # {"status":"ok"}
docker exec deploy-postgres-1 pg_isready -U postgres
docker exec deploy-redis-1 redis-cli ping                           # PONG
curl -fsS http://localhost:9000/minio/health/live                   # 200
```

## 5. CI 速查

| 入口 | 命令 |
|---|---|
| 一键全跑（本地） | `bash scripts/ci.sh` |
| 仅 Java | `cd xg-backend && ./gradlew :xg-business:test` |
| 仅 Python | `cd xg-ai && pytest tests/` |
| 仅前端 | `cd xg-frontend/apps/web && pnpm exec tsc --noEmit`（mini 同理） |
| GitHub Actions | `.github/workflows/ci.yml`（push/PR 自动） |
| Gitee Go | `.workflow/ci.yml`（仓库 → 流水线手动启用一次） |
| 一次性激活 pre-commit hook | `bash scripts/install-hooks.sh`（每个 clone 跑一次；改动版本相关文件时自动刷 `docs/release.md`） |

## 6. 数据库 & 多租户

- 库名：`xg1`，**所有业务表带 `tenant_id`**，按 schema 分租户
- 新租户创建：通过 `POST /api/v1/admin/tenants` 触发；`TenantMigrationRunner`
  会在新 schema 上跑全量 Flyway tenant migrations（`db/migration/tenant/Vxxx__*.sql`）
- migrations 目录：`xg-backend/xg-app/src/main/resources/db/migration/tenant/`
- 当前最高版本：见 `docs/release.md` 的 `VERSION-SNAPSHOT` 块（`bash scripts/sync-release-snapshot.sh` 刷新；激活 pre-commit hook 后会自动跑）
- 回滚：Flyway 不支持自动回滚；写补偿 migration（VxxxR__rollback_*.sql）

## 7. AI Sidecar 配置

环境变量（覆盖 `app/config.py` 默认值，`.env` 也可）：

```
HOST=0.0.0.0
PORT=8001
JAVA_BASE_URL=http://localhost:8080
DEEPSEEK_API_KEY=...                # P0 主提供者
ANTHROPIC_API_KEY=...               # ZenMux 适配器，可选
DEBUG=false                         # true 启用 reload + debug log
CORS_ORIGINS=["https://your-mini-domain"]
```

直接执行单个工具（绕开 LLM）：
```bash
curl -X POST http://localhost:8001/api/v1/tools/draft_workstudy_application_intro/execute \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 100' -H 'X-Tenant-Id: default' -H 'X-User-Role: student' \
  -d '{"args":{"position_id":42}}'
```

## 8. 常见故障

### "Unable to locate a Java Runtime"
macOS 默认 `/usr/bin/java` 是 stub。`scripts/ci.sh` 已自动探测 `/opt/homebrew/Cellar/openjdk@17/...`。
手动：`export JAVA_HOME=$(/usr/libexec/java_home -v 17)`。

### Taro build 失败 schema-utils ProgressPlugin
Node ≥ 23 与 Taro 3.6.x 不兼容。`nvm use 20` 即可。`apps/mini/package.json` 已加 engines 警告。

### "找不到 biz_type=workstudy_xxx 的已发布工作流定义"
租户没跑 V054 migration。检查：
```sql
SELECT id, code, version, status, biz_type FROM workflow_definition
 WHERE biz_type LIKE 'workstudy%' ORDER BY id;
```
应看到 1004/1005/1006/1007 status='published'，1002/1003 status='archived'。

### 申请被拒"不符合岗位申请条件"
学生 `student_profile.aid_level / grade / college` 与 `position.aid_levels / grade_limits / college_limits` 不匹配。
逻辑见 `WorkStudyService.isEligible` + 单测 `WorkStudyEligibilityTest`。

### 申请被拒"在岗数已达上限"
`work_study_year_setting.max_fixed_per_student` 默认 1、`max_temp_per_student` 默认 5。学工管理员
在 Web 端 `勤工助学 → 学年配置` 可调。

### Listener 没同步状态（position 还在 pending_approval）
检查工作流实例是否真到了终态：
```sql
SELECT id, biz_type, biz_id, status, current_node_id FROM workflow_instance
 WHERE biz_type = 'workstudy_position' ORDER BY id DESC LIMIT 5;
```
status 不是 completed/rejected → 还有 pending task 没处理。

## 9. Mini 小程序真机调试

### 本机模拟器（最快路径）
1. `nvm use 20`（Taro 3.6 不兼容 Node ≥ 23）
2. `cd xg-frontend/apps/mini && pnpm dev:weapp`，等首次构建完
3. 微信开发者工具 → 导入项目 → 路径选 `xg-frontend/apps/mini/dist`
4. AppID 填测试号或公司 AppID；调试基础库 ≥ 2.30
5. **关键**：右上角"详情" → "本地设置" → 勾选"不校验合法域名"（仅模拟器可绕开 HTTPS）

模拟器调通后，dev:weapp watch 会增量编译，HMR 由微信开发者工具触发刷新。

### 真机预览（要走 HTTPS）
微信小程序真机**只允许 HTTPS** 调用预先注册的服务器域名：

1. 后端跑在公网 HTTPS（自签证书不行，得正式 CA 或 Let's Encrypt）
2. 微信公众平台 → 开发设置 → "服务器域名"：
   - request 合法域名：`https://api.example.com`、`https://ai.example.com`
   - 注意：小程序的"合法域名"是**前缀完全匹配**（`https://api.example.com` 不会覆盖 `:8080` 端口）
3. 改 `xg-frontend/apps/mini/config/prod.ts`：
   ```ts
   defineConstants: {
     'process.env.XG_API_BASE_URL': JSON.stringify('https://api.example.com/api/v1'),
     'process.env.XG_AI_BASE_URL':  JSON.stringify('https://ai.example.com/api/v1'),
   }
   ```
4. `pnpm build:weapp`（出 prod 包）
5. 微信开发者工具 → "上传" → 在"版本管理" → "体验版" → 添加体验者手机号
6. 手机微信 → 我 → 设置 → 关于微信 → 开发者工具入口 →（仅本人开发账号能看到体验版）

### 真机抓包调试
- 微信开发者工具自带 Network 面板（最优先用）
- 真机：用 [Charles](https://www.charlesproxy.com/) + 手机连同一 WiFi → Charles 装根证书 → 手机配代理；**注意微信对 SSL Pinning 不严，但部分接口会拒绝代理**
- 调试 AI 工具直调（绕开 LLM）：见 §7 那段 curl，把 host 改 prod 域名，header 加 token

### 常见真机故障
| 现象 | 原因 |
|---|---|
| `request:fail url not in domain list` | 域名没在公众平台注册或拼错 |
| `request:fail invalid url "..."`（HTTP） | 真机不允许 HTTP；切 HTTPS |
| 列表空但 console 看到 200 响应 | 大概率是 `R<{data:...}>` 被 axios 拨开两层；mini 的 `request.ts` 已处理但留意自定义 endpoint |
| 登录 401 → reLaunch 死循环 | `userId/token` storage 已写但被服务端拒；先清缓存再登录 |

## 10. 关键人 & 升级路径

- **Web/Mini 报错** → 先看浏览器/微信开发者工具 console，再看 Java 日志
- **AI 工具调用错** → 看 `xg-ai` 日志（默认 stderr），`X-User-Role` 不对会触发 role-gating 拒绝
- **数据库冲突 / Flyway 失败** → 不要直接 `flyway repair`；看 `xg-app` 启动日志的具体 migration ID 后再决定
