from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/xg1"

    # Redis
    redis_url: str = "redis://localhost:6379/1"

    # Java backend
    java_base_url: str = "http://localhost:8080"
    internal_token: str = "dev-internal-token"

    # LLM providers
    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-plus"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://zenmux.ai/api/v1"
    deepseek_model: str = "deepseek/deepseek-v3.2"

    # Anthropic-compatible endpoint (ZenMux). Used as the primary chat provider.
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://zenmux.ai/api/anthropic"
    anthropic_model: str = "deepseek/deepseek-v3.2"

    # RAG
    embedding_model: str = "BAAI/bge-small-zh-v1.5"
    embedding_dim: int = 512
    rag_top_k: int = 5
    rag_threshold: float = 0.7

    # Rate limiting
    rate_limit_per_minute: int = 10

    # CORS
    cors_origins: list[str] = []

    # App
    debug: bool = False

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
