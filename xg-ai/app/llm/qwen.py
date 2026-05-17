# DEPRECATED-by: app/llm/openai_client.py, planned removal: M3 末
#
# 薄壳：保留 `from app.llm.qwen import QwenProvider` 这条 import 路径与方法签名，
# 内部全部转发到 `app.llm.openai_client`。
"""Qwen provider — thin shim forwarding to app.llm.openai_client (M2)."""
from __future__ import annotations

import logging

from app.config import settings
from app.llm import openai_client as oc
from app.llm.fallback import try_primary_then
from app.llm.provider import ChatMessage, ChatResult, LLMProvider

logger = logging.getLogger(__name__)

__all__ = ["QwenProvider"]


class QwenProvider(LLMProvider):
    """Alibaba Qwen (通义千问) — shim → openai_client (One-API or direct)."""

    def __init__(self) -> None:
        self.model = settings.qwen_model
        self.embedding_model = settings.embedding_model

    def _one_api_client(self):
        return oc.get_client()

    def _direct_client(self):
        key = (settings.qwen_api_key or "").strip()
        if not key:
            raise RuntimeError(
                "Qwen API key not configured. Set QWEN_API_KEY (or OPENAI_API_*) "
                "in the container env."
            )
        return oc.get_client(base_url=settings.qwen_base_url, api_key=key)

    async def chat(self, messages: list[ChatMessage], **kwargs) -> ChatResult:
        model = kwargs.pop("model", self.model)
        temperature = kwargs.pop("temperature", 0.7)
        max_tokens = kwargs.pop("max_tokens", 2048)
        primary = self._one_api_client()

        async def _direct() -> ChatResult:
            return await oc.chat(self._direct_client(), messages,
                                 model=model, temperature=temperature, max_tokens=max_tokens, **kwargs)

        if primary is None:
            return await _direct()

        async def _via_one_api() -> ChatResult:
            return await oc.chat(primary, messages,
                                 model=model, temperature=temperature, max_tokens=max_tokens, **kwargs)

        return await try_primary_then(_via_one_api, _direct, op="qwen.chat")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        primary = self._one_api_client()

        async def _direct() -> list[list[float]]:
            return await oc.embed(self._direct_client(), texts, model=self.embedding_model)

        if primary is None:
            return await _direct()

        async def _via_one_api() -> list[list[float]]:
            return await oc.embed(primary, texts, model=self.embedding_model)

        return await try_primary_then(_via_one_api, _direct, op="qwen.embed")
