import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class BaseTool:
    """Base class for AI tools that delegate execution to the Java backend."""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self._client = httpx.AsyncClient(
            base_url=settings.java_base_url,
            timeout=10.0,
            headers={"X-Internal-Token": settings.internal_token},
        )

    async def execute(
        self,
        params: dict[str, Any],
        user_id: str,
        tenant_id: str,
        user_role: str,
    ) -> dict[str, Any]:
        """Execute tool by calling Java backend internal API."""
        try:
            response = await self._client.post(
                f"/internal/v1/tools/{self.name}/execute",
                json=params,
                headers={
                    "X-User-Id": user_id,
                    "X-Tenant-Id": tenant_id,
                    "X-User-Role": user_role,
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("Tool %s execution failed: %s", self.name, e.response.text)
            return {"error": True, "message": f"工具执行失败: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error("Tool %s request error: %s", self.name, str(e))
            return {"error": True, "message": "后端服务暂时不可用"}
