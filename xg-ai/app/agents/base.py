"""Conversation Agent base class — *skeleton only*.

预期职责（M3.3 实现）:
- 持有 LLM client（来自 `app.llm.openai_client`）、tool list（来自 `app.tools.tool_registry`）、
  checkpointer（来自 `app.memory.checkpoint`）。
- 提供 `astream(messages, *, thread_id, user_ctx) -> AsyncIterator[Event]` 统一流式接口，
  事件类型 = thinking / tool_call / tool_result / approval_required / token / done。
- 高风险工具触发 `interrupt_before`，把待审批 tool_calls 写入 `ai_approval_queue` 表。

依赖（未来）:
- `langchain.agents.create_agent`（v1+）
- `langgraph.checkpoint.postgres.PostgresSaver`
- `langfuse.langchain.CallbackHandler`

不要在 M1/M2 阶段从其他模块 import 本文件。
"""
# STATUS: skeleton-only, target: M3.3
from __future__ import annotations

from typing import Any


class ConversationAgent:
    """Placeholder. See module docstring for design intent."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError("ConversationAgent will be implemented in M3.3")
