"""Unified OpenAI-compatible LLM client (entry point for One-API).

设计要点（M2 实现）:
- 客户端按 (base_url, api_key) 缓存为单例（lru_cache）。
- 默认走 One-API（`settings.openai_api_base_url`，留空则走厂商直连，保持 M1 行为）。
- Langfuse env 完整时，自动用 `langfuse.openai.AsyncOpenAI` 替代原版 SDK，
  所有 chat / embed 调用自动落 trace；env 缺失时退回原版 `openai.AsyncOpenAI`，零副作用。
- 老 `DeepSeekProvider` / `QwenProvider` 改成本文件的薄壳；外部 import 路径与方法签名一字不变。

依赖:
- openai>=1.30.0
- langfuse>=2.0 (optional; 缺失时降级到 openai SDK)

STATUS: implemented (M2)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.config import settings
from app.llm.provider import ChatMessage, ChatResult

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    """OpenAI-style tool call. `input` is the parsed dict (arguments JSON decoded)."""

    id: str
    name: str
    input: dict


@dataclass
class LLMTurn:
    """One model turn in OpenAI tool_calls form.

    Mirrors the historical `app.llm.deepseek.DeepSeekTurn` shape so the shim
    can re-export it without callers noticing.
    """

    assistant_message: dict
    text: str
    tool_calls: list[ToolCall]
    finish_reason: str | None = None
    usage: dict | None = None


# ─────────────────────────── client factory ───────────────────────────


def _langfuse_enabled() -> bool:
    return bool(
        settings.langfuse_host
        and settings.langfuse_public_key
        and settings.langfuse_secret_key
    )


@lru_cache(maxsize=8)
def _make_client(base_url: str, api_key: str):
    """Lazy-create an AsyncOpenAI instance, optionally Langfuse-wrapped.

    Cached by (base_url, api_key) so we don't churn HTTP pools per call.
    Returns `None` when api_key is empty (caller decides how to error out).
    """
    if not api_key:
        return None

    if _langfuse_enabled():
        try:
            from langfuse.openai import AsyncOpenAI  # type: ignore
        except Exception as e:  # pragma: no cover - optional dep
            logger.warning(
                "langfuse openai wrapper unavailable (%s); falling back to plain openai SDK", e
            )
            from openai import AsyncOpenAI  # type: ignore
    else:
        from openai import AsyncOpenAI  # type: ignore

    return AsyncOpenAI(api_key=api_key, base_url=base_url)


def get_client(*, base_url: str | None = None, api_key: str | None = None):
    """Resolve an AsyncOpenAI client.

    Resolution order:
    1) If caller passes explicit base_url+api_key → use them (provider direct path).
    2) Else if `settings.openai_api_base_url` configured → use One-API.
    3) Else → return None; caller must fall back to its own client.
    """
    if base_url and api_key:
        return _make_client(base_url, api_key)
    if settings.openai_api_base_url and settings.openai_api_key:
        return _make_client(settings.openai_api_base_url, settings.openai_api_key)
    return None


# ─────────────────────────── public api ───────────────────────────


def _to_openai_tool(t: dict) -> dict:
    """Convert Anthropic-style {name, description, input_schema} → OpenAI tools[] entry.

    Keeps callers (shims) free to pass either OpenAI-native or Anthropic-style tool
    schemas — same convention the legacy `app.llm.deepseek` module used.
    """
    if "function" in t:  # already in OpenAI shape
        return t
    return {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
        },
    }


async def chat(
    client,
    messages: list[ChatMessage],
    *,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    **extra: Any,
) -> ChatResult:
    """ChatMessage[] → ChatResult. Mirrors legacy provider.chat() exactly."""
    if client is None:
        raise RuntimeError(
            "OpenAI-compatible client is not configured. "
            "Set OPENAI_API_BASE_URL/OPENAI_API_KEY, or provider's own key."
        )
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": m.role, "content": m.content} for m in messages],
        temperature=temperature,
        max_tokens=max_tokens,
        **extra,
    )
    choice = response.choices[0]
    return ChatResult(
        content=choice.message.content or "",
        model=response.model,
        usage=dict(response.usage) if response.usage else None,
    )


async def chat_native(
    client,
    messages: list[dict],
    *,
    model: str,
    tools: list[dict] | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    **extra: Any,
) -> LLMTurn:
    """OpenAI-native messages turn. Accepts Anthropic-style tools (converted internally)."""
    if client is None:
        raise RuntimeError(
            "OpenAI-compatible client is not configured. "
            "Set OPENAI_API_BASE_URL/OPENAI_API_KEY, or provider's own key."
        )
    params: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        params["tools"] = [_to_openai_tool(t) for t in tools]
        params["tool_choice"] = "auto"
    params.update(extra)

    response = await client.chat.completions.create(**params)
    choice = response.choices[0]
    msg = choice.message

    assistant_message: dict = {"role": "assistant", "content": msg.content or ""}
    tool_calls: list[ToolCall] = []
    if msg.tool_calls:
        assistant_message["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments or "{}",
                },
            }
            for tc in msg.tool_calls
        ]
        for tc in msg.tool_calls:
            try:
                parsed = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                logger.warning(
                    "tool_call %s arguments not JSON: %r",
                    tc.function.name,
                    tc.function.arguments,
                )
                parsed = {}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, input=parsed))

    return LLMTurn(
        assistant_message=assistant_message,
        text=msg.content or "",
        tool_calls=tool_calls,
        finish_reason=choice.finish_reason,
        usage=dict(response.usage) if response.usage else None,
    )


async def embed(client, texts: list[str], *, model: str) -> list[list[float]]:
    if client is None:
        raise RuntimeError("OpenAI-compatible client is not configured for embeddings.")
    response = await client.embeddings.create(model=model, input=texts)
    return [item.embedding for item in response.data]
