from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
from logging.handlers import RotatingFileHandler

from app.config import settings
from app.api import health, chat, insight, task_recommendation, agent, tools, kb, polish, asr, workflow_config, notification_config, leave_policy, ai_observer


def _configure_logging() -> None:
    """统一配置 root + uvicorn 日志。LOG_FILE 存在时同时落盘。"""
    level_name = os.getenv("LOG_LEVEL", "DEBUG" if settings.debug else "INFO")
    level = logging.getLevelName(level_name.upper())
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

    handlers: list[logging.Handler] = [logging.StreamHandler()]

    log_file = os.getenv("LOG_FILE")
    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        handlers.append(
            RotatingFileHandler(
                log_file,
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
        )

    for h in handlers:
        h.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)
    for h in handlers:
        root.addHandler(h)

    # uvicorn 维护自己的 logger，需要单独接管才能落到同一文件
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        ulog = logging.getLogger(name)
        ulog.handlers.clear()
        ulog.setLevel(level)
        for h in handlers:
            ulog.addHandler(h)
        ulog.propagate = False


_configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("XG AI Sidecar starting...")
    try:
        from app.rag.kb.legacy_seed import seed_legacy_docs_if_empty
        await seed_legacy_docs_if_empty()
    except Exception:
        logger.exception("legacy KB seed failed; continuing without")
    try:
        from app.rag.kb.eval_seed import seed_default_eval_cases_if_empty
        await seed_default_eval_cases_if_empty()
    except Exception:
        logger.exception("default eval seed failed; continuing without")
    yield
    logger.info("XG AI Sidecar shutting down...")


app = FastAPI(
    title="XG AI Sidecar",
    description="AI engine for Student Affairs Service System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(chat.router, prefix="/api/v1")
app.include_router(insight.router, prefix="/api/v1")
app.include_router(task_recommendation.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(tools.router, prefix="/api/v1")
app.include_router(kb.router, prefix="/api/v1")
app.include_router(polish.router, prefix="/api/v1")
app.include_router(asr.router, prefix="/api/v1")
app.include_router(workflow_config.router, prefix="/api/v1")
app.include_router(notification_config.router, prefix="/api/v1")
app.include_router(leave_policy.router, prefix="/api/v1")
app.include_router(ai_observer.router, prefix="/api/v1")
