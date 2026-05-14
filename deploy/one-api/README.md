# One-API（模型网关）

**STATUS: skeleton-only, target: M2**

把所有大模型 API 调用统一收敛到 One-API（OpenAI 兼容协议），代码侧只认一个 `base_url`，
渠道 / 路由 / 限流 / 成本统计 / 降级全部在网关 UI 里配。

## 当前状态（M1）

- `docker-compose.yml` 中已有 `one-api` service，`profiles: ["full"]`，**默认不启动**。
- Python AI 代码**未引用** One-API；`xg-ai/app/llm/openai_client.py` 占位待 M2 实现。
- 启动 `docker compose --profile full up -d` 会把它和 grafana / prometheus 一起带起，端口 `${ONE_API_PORT:-3300}`。

## M1 验证启动（可选，不影响业务）

```bash
cd /Users/liufei/project/xg-prototype
docker compose -f deploy/docker-compose.yml --profile full up -d one-api postgres
# 等健康检查通过
open http://localhost:3300
# 首次登录 root / 123456，进入后立刻改密码
```

## M2 接入步骤（届时执行，本 M1 文档先记下）

1. **建库**（仅当切换到 PG 存储时）:
   ```sql
   CREATE DATABASE one_api;
   ```
   然后取消 `docker-compose.yml` 中 `SQL_DSN` 行的注释，重启容器。M1 阶段用 SQLite 即可。
2. **配置上游渠道**（OpenAI/DeepSeek/Qwen/...）:
   - 控制台 → 渠道 → 新建
   - 填上游 base_url / api_key / 支持的模型列表
3. **配置令牌**:
   - 控制台 → 令牌 → 新建，把生成的 `sk-...` 写入 `xg-ai/.env` 的 `OPENAI_API_KEY`
4. **xg-ai 切换**:
   - `xg-ai/.env`: `OPENAI_API_BASE_URL=http://one-api:3000/v1`
   - `xg-ai/app/llm/openai_client.py`（M2 实现）从该 base_url 创建 `AsyncOpenAI` 单例
5. **测试**:
   ```bash
   curl http://localhost:3300/v1/chat/completions \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hello"}]}'
   ```

## 端口规划

| 服务 | 主机端口 (env) | 容器端口 |
|--|--|--|
| Grafana | 3000 | 3000 |
| Langfuse | `${LANGFUSE_PORT:-3001}` | 3000 |
| **One-API** | `${ONE_API_PORT:-3300}` | 3000 |

避开 3000/3001，便于本地同时跑前端 dev server。

## 安全注意

- **必改** `ONE_API_SESSION_SECRET` 环境变量
- **必改** root 默认密码 `123456`
- 生产环境只通过校内 Nginx 反代访问，不直接对外暴露 `${ONE_API_PORT}`
