# Langfuse（AI 可观测）

**STATUS: skeleton-only, target: M2**

接管 LangChain / LangGraph 的 callback，把每次 LLM 调用、Tool 调用、Token 消耗、prompt 版本
都打成 trace，便于排障和评估。是"上生产前必装"的 AI 调试器。

## 当前状态（M1）

- `docker-compose.yml` 中已有 `langfuse` service，`profiles: ["full"]`，**默认不启动**。
- Python AI 代码**未引用** Langfuse；`xg-ai/app/observability/langfuse.py` 当前返回空 callback 列表（no-op）。
- M2 才把 `get_callbacks(...)` 接到 `chat / agent / kb` 等入口。

## M1 验证启动（可选）

```bash
cd /Users/liufei/project/xg-prototype

# 1) 一次性建库（PG 第一次启动且 langfuse 没建过时执行）
docker compose -f deploy/docker-compose.yml exec postgres \
  psql -U postgres -c "CREATE DATABASE langfuse;"

# 2) 启动 langfuse
docker compose -f deploy/docker-compose.yml --profile full up -d langfuse

# 3) 打开 UI
open http://localhost:3001
# 注册第一个账号（首个账号自动成为 admin），创建 project，拿到 PUBLIC_KEY / SECRET_KEY
```

## M2 接入步骤（届时执行，本 M1 文档先记下）

1. 拿到 Langfuse project 的 PUBLIC_KEY / SECRET_KEY 填入 `xg-ai/.env`:
   ```
   LANGFUSE_HOST=http://langfuse:3000      # 容器互联
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   ```
2. `xg-ai/app/observability/langfuse.py` 在 M2 实现 `get_callbacks(...)`；
   现有 chat/agent 入口加一行 `config={"callbacks": get_callbacks(user_id=...)}`，其余零改动。
3. 跑一次现有对话，刷新 Langfuse → Traces，应能看到完整调用树（LLM → Tool → LLM）。

## 镜像版本说明

我们选 `langfuse/langfuse:2`（v2 系列）：
- 只依赖 PostgreSQL，单容器即可跑（v3 引入 ClickHouse + Redis Worker，部署成本高）。
- 与现有 PG 实例共用，schema 隔离即可。
- 后续如果 trace 量级上去（> 100w/day），再评估升 v3。

## 安全注意

- **必改** `LANGFUSE_NEXTAUTH_SECRET`（≥32 字符随机串）和 `LANGFUSE_SALT`
- 生产仅通过校内 Nginx 反代访问，配 SSO 或基础认证
- Langfuse 会**完整记录 prompt 与回答内容**，含 PII 时需在入库前脱敏（M3.1 由 `output_filter` 负责）
