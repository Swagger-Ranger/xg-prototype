"""LLM fallback chain (M2).

调用方传两个 callable：
    primary()   — 通常是 openai_client + One-API 路径
    secondary() — 通常是厂商直连（ZenMux / dashscope）

primary 抛任意异常（超时 / 5xx / 限流 / 连不上）就回落到 secondary。
secondary 抛错时直接向上传播——业务侧自己 try/except 降级（与 M1 行为一致）。

刻意没引入 tenacity：M2 阶段两段链 + 单次重试已经够用，
减少新依赖；后续需要时再升级。
"""
from __future__ import annotations

import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def try_primary_then(
    primary: Callable[[], Awaitable[T]],
    secondary: Callable[[], Awaitable[T]],
    *,
    op: str = "llm_call",
) -> T:
    """Run `primary`; on any exception, log a WARNING and run `secondary`."""
    try:
        return await primary()
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "primary %s failed (%s: %s); falling back to secondary",
            op,
            type(e).__name__,
            e,
        )
        return await secondary()
