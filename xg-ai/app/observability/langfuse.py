"""Langfuse CallbackHandler factory (M2).

两条独立的 trace 通道：

1) **OpenAI SDK 自动 trace** —— 由 `app.llm.openai_client` 在创建 client 时
   选择 `langfuse.openai.AsyncOpenAI`，所有 chat/embed 调用自动落 trace。
   业务代码零改动。是 M2 主要 trace 来源。

2) **LangChain / LangGraph callbacks** —— 本文件的 `get_callbacks()` 返回
   `[CallbackHandler(...)]`，给少量走 LangGraph 的入口（如 `agent/*_author`）
   通过 `config={"callbacks": ...}` 注入。这条通道与 (1) 互不干扰，
   两者都开时，trace 会按 langfuse 内部规则合并到同一棵树。

任一 env (`LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`) 缺失：
- (1) 退回到原版 openai SDK
- (2) `get_callbacks()` 返回 `[]`

业务侧调用模式：
    from app.observability.langfuse import get_callbacks
    config = {"callbacks": get_callbacks(user_id="...", session_id="...")}
    result = await graph.ainvoke(state, config=config)

依赖:
- langfuse>=2.0 (optional)

STATUS: implemented (M2)
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return bool(
        settings.langfuse_host
        and settings.langfuse_public_key
        and settings.langfuse_secret_key
    )


def get_callbacks(
    *,
    user_id: str | None = None,
    session_id: str | None = None,
    **metadata: Any,
) -> list[Any]:
    """Return Langfuse CallbackHandler list, or `[]` if Langfuse env not configured.

    Safe to call unconditionally — callers do not need to check env themselves.
    `user_id` / `session_id` / metadata are attached to traces created by this handler.
    """
    if not _enabled():
        return []
    try:
        from langfuse.callback import CallbackHandler  # type: ignore
    except Exception as e:  # pragma: no cover - optional dep
        logger.warning("langfuse SDK not installed (%s); callbacks disabled.", e)
        return []

    try:
        handler = CallbackHandler(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
            user_id=user_id,
            session_id=session_id,
            metadata=metadata or None,
        )
        return [handler]
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("failed to construct Langfuse CallbackHandler: %s", e)
        return []
