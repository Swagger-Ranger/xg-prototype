"""LLM fallback chain — *skeleton only* (M2).

预期:
- One-API 5xx / 超时 / 限流 → 直连 ZenMux / dashscope。
- 使用 `tenacity` 指数退避 + 上限 3 次；最终失败抛 `LLMUnavailableError`。
- 与 `openai_client.py` 的拦截层集成（装饰器或显式 fallback chain）。

STATUS: skeleton-only, target: M2
"""
