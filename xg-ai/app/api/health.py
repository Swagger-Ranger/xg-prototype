from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    services: dict[str, str]


@router.get("/health")
async def health_check() -> HealthResponse:
    """Health check endpoint for docker-compose and monitoring."""
    # TODO: Check actual service connectivity
    return HealthResponse(
        status="ok",
        version="0.1.0",
        services={
            "llm": "not_configured",
            "database": "not_connected",
            "redis": "not_connected",
        },
    )
