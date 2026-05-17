# DEPRECATED-by: app/llm/openai_client.py, planned removal: M3 末
#
# 本文件保留是为了让现有 9+ 个调用方零改动地继续 `from app.llm.deepseek import DeepSeekProvider`。
# 内部逻辑全部转发到 `app.llm.openai_client`：
#   - 若 `OPENAI_API_BASE_URL` + `OPENAI_API_KEY` 配齐 → 走 One-API（M2 主路径）
#   - 否则 → 走原 DeepSeek 直连（ZenMux），与 M1 行为完全一致
#
# 公开符号（外部依赖）:
#   - DeepSeekProvider, ToolCall, DeepSeekTurn   # 见下方的 re-export
"""DeepSeek provider — thin shim forwarding to app.llm.openai_client (M2)."""
from __future__ import annotations

import logging

from app.config import settings
from app.llm import openai_client as oc
from app.llm.fallback import try_primary_then
from app.llm.openai_client import ToolCall, LLMTurn as DeepSeekTurn  # re-export
from app.llm.provider import ChatMessage, ChatResult, LLMProvider

logger = logging.getLogger(__name__)

__all__ = ["DeepSeekProvider", "ToolCall", "DeepSeekTurn"]


class DeepSeekProvider(LLMProvider):
    """DeepSeek-compatible provider.

    Internally a shim — actual HTTP is done by `app.llm.openai_client`.
    Public surface (constructor signature, `.chat`, `.chat_native`, `.embed`,
    raised errors) is preserved.
    """

    def __init__(self) -> None:
        self.model = settings.deepseek_model

    def _one_api_client(self):
        """Return One-API client if configured, else None."""
        return oc.get_client()

    def _direct_client(self):
        """Return direct ZenMux/DeepSeek client; raise if no key."""
        key = (settings.deepseek_api_key or "").strip()
        if not key:
            raise RuntimeError(
                "DeepSeek API key not configured. Set DEEPSEEK_API_KEY (or OPENAI_API_*) "
                "in the container env."
            )
        return oc.get_client(base_url=settings.deepseek_base_url, api_key=key)

    async def chat(self, messages: list[ChatMessage], **kwargs) -> ChatResult:
        model = kwargs.pop("model", self.model)
        temperature = kwargs.pop("temperature", 0.7)
        max_tokens = kwargs.pop("max_tokens", 2048)
        primary_client = self._one_api_client()

        async def _direct() -> ChatResult:
            return await oc.chat(
                self._direct_client(), messages,
                model=model, temperature=temperature, max_tokens=max_tokens, **kwargs,
            )

        if primary_client is None:
            return await _direct()

        async def _via_one_api() -> ChatResult:
            return await oc.chat(
                primary_client, messages,
                model=model, temperature=temperature, max_tokens=max_tokens, **kwargs,
            )

        return await try_primary_then(_via_one_api, _direct, op="deepseek.chat")

    async def chat_native(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> DeepSeekTurn:
        model = kwargs.pop("model", self.model)
        temperature = kwargs.pop("temperature", 0.7)
        max_tokens = kwargs.pop("max_tokens", 2048)
        primary_client = self._one_api_client()

        async def _direct() -> DeepSeekTurn:
            return await oc.chat_native(
                self._direct_client(), messages,
                model=model, tools=tools, temperature=temperature, max_tokens=max_tokens, **kwargs,
            )

        if primary_client is None:
            return await _direct()

        async def _via_one_api() -> DeepSeekTurn:
            return await oc.chat_native(
                primary_client, messages,
                model=model, tools=tools, temperature=temperature, max_tokens=max_tokens, **kwargs,
            )

        return await try_primary_then(_via_one_api, _direct, op="deepseek.chat_native")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError(
            "DeepSeek does not provide embedding API. Use Qwen for embeddings."
        )
