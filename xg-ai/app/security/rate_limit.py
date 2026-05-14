"""Per-user / per-tenant rate limiting (Redis sliding window) — *skeleton only*.

预期（M3.1）:
- 装饰器 `@rate_limit("agent.run", per_user=10/min, per_tenant=200/min)`。
- 配额表 `ai_user_quota`（M3.1 DB 迁移）记录 token / 调用次数日 / 月限额，
  超限返回结构化错误（不直接 429，避免前端被动重试）。

STATUS: skeleton-only, target: M3.1
"""
