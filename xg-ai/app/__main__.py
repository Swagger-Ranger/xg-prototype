"""Entrypoint for `python -m app` — runs the FastAPI app under uvicorn.

Reads host/port from settings (env vars: HOST, PORT). Default port is 8001
to avoid clashing with the Java backend on 8080.
"""
import uvicorn

from app.config import settings


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )


if __name__ == "__main__":
    main()
