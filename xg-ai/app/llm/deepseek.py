import json
import logging
from dataclasses import dataclass
from openai import AsyncOpenAI

from app.config import settings
from app.llm.provider import LLMProvider, ChatMessage, ChatResult

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    """OpenAI-style tool call. `input` is the parsed dict (arguments JSON decoded)."""
    id: str
    name: str
    input: dict


@dataclass
class DeepSeekTurn:
    """One model turn in OpenAI tool_calls form.

    `assistant_message` is the raw dict ready to be echoed back verbatim
    as the next turn's assistant message. For each tool_call in it, the
    caller must append a {"role": "tool", "tool_call_id": ..., "content": ...}
    message before the next round.
    """
    assistant_message: dict
    text: str
    tool_calls: list[ToolCall]
    finish_reason: str | None = None
    usage: dict | None = None


def _to_openai_tool(t: dict) -> dict:
    """Convert an Anthropic-style {name, description, input_schema} tool
    definition to an OpenAI tools[] entry."""
    return {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
        },
    }


class DeepSeekProvider(LLMProvider):
    """DeepSeek LLM provider via OpenAI-compatible API."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        self.model = settings.deepseek_model

    async def chat(self, messages: list[ChatMessage], **kwargs) -> ChatResult:
        response = await self.client.chat.completions.create(
            model=kwargs.get("model", self.model),
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=kwargs.get("temperature", 0.7),
            max_tokens=kwargs.get("max_tokens", 2048),
        )
        choice = response.choices[0]
        return ChatResult(
            content=choice.message.content or "",
            model=response.model,
            usage=dict(response.usage) if response.usage else None,
        )

    async def chat_native(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> DeepSeekTurn:
        """Single model turn using OpenAI-native messages (system/user/assistant/tool).

        `tools` accepts the Anthropic-style {name, description, input_schema} shape
        and is converted internally. Caller drives multi-turn by appending
        `turn.assistant_message`, then one {"role": "tool", ...} per tool call.
        """
        params: dict = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }
        if tools:
            params["tools"] = [_to_openai_tool(t) for t in tools]
            params["tool_choice"] = "auto"

        response = await self.client.chat.completions.create(**params)
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
                    logger.warning("tool_call %s arguments not JSON: %r", tc.function.name, tc.function.arguments)
                    parsed = {}
                tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, input=parsed))

        return DeepSeekTurn(
            assistant_message=assistant_message,
            text=msg.content or "",
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason,
            usage=dict(response.usage) if response.usage else None,
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("DeepSeek does not provide embedding API. Use Qwen for embeddings.")
