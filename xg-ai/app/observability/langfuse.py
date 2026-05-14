"""Langfuse CallbackHandler factory — *skeleton only* (M2 实现).

预期（M2）:
- `get_callbacks(user_id: str, session_id: str, **metadata) -> list[BaseCallbackHandler]`
- 当 env `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` 任一缺失时返回 `[]`，
  保证不配置 Langfuse 的部署完全不受影响（向后兼容现状）。
- 业务侧只需在 `agent.ainvoke / llm.chat` 的 config 里加：
      config={"callbacks": get_callbacks(user_id=..., session_id=...)}
  其余零改动。

依赖（pyproject.toml M2 时新增）:
- langfuse >= 3.0

STATUS: skeleton-only, target: M2
"""
from __future__ import annotations

from typing import Any


def get_callbacks(
    *,
    user_id: str | None = None,
    session_id: str | None = None,
    **metadata: Any,
) -> list[Any]:
    """No-op until M2. Returns empty list so caller can unconditionally pass it."""
    return []
