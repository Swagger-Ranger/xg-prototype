from abc import ABC, abstractmethod
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str  # system, user, assistant
    content: str


class ChatResult(BaseModel):
    content: str
    model: str
    usage: dict | None = None


class LLMProvider(ABC):
    """Abstract LLM provider interface."""

    @abstractmethod
    async def chat(self, messages: list[ChatMessage], **kwargs) -> ChatResult:
        """Send chat completion request."""
        ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for texts."""
        ...
