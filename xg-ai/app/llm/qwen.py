import logging
from openai import AsyncOpenAI

from app.config import settings
from app.llm.provider import LLMProvider, ChatMessage, ChatResult

logger = logging.getLogger(__name__)


class QwenProvider(LLMProvider):
    """Alibaba Qwen (通义千问) LLM provider via OpenAI-compatible API."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
        )
        self.model = settings.qwen_model
        self.embedding_model = settings.embedding_model

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

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self.client.embeddings.create(
            model=self.embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]
