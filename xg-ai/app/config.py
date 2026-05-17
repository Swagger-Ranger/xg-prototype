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

    # ─── M2: 模型网关 (One-API) ───
    # 留空 → 维持 M1 行为：直连 ZenMux / dashscope（与 M1 验收一致）。
    # 配上 → 所有 chat / embed 流量统一走 One-API（OpenAI 兼容），
    #        失败回落到对应厂商直连（见 app/llm/fallback.py）。
    openai_api_base_url: str = ""
    openai_api_key: str = ""

    # 按场景路由（M2 起；缺省值与现有 deepseek/qwen 一致，未配置 One-API 时仍然生效）。
    model_router_default: str = ""    # 缺省时用 deepseek_model
    model_chat_default: str = ""      # 缺省时用 deepseek_model
    model_analysis_default: str = ""  # 缺省时用 deepseek_model
    model_embedding_default: str = ""  # 缺省时用 settings.embedding_model

    # ─── M2: 可观测 (Langfuse) ───
    # 三个一起为空 → get_callbacks() 返回 []，langfuse openai wrapper 不启用，
    # 业务行为与 M1 完全一致。
    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""

    # 讯飞开放平台（语音听写 / 录音文件转写）
    xfyun_app_id: str = ""
    xfyun_api_key: str = ""
    xfyun_api_secret: str = ""

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
    host: str = "0.0.0.0"
    port: int = 8001

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
