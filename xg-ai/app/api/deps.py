"""FastAPI 共享依赖 — 把鉴权口子统一收到一处。

两类调用方:
- **Java→sidecar 内部调用**(write-recommendation-reasons / insight / agent 等):
  必须带 X-Internal-Token,校验失败 401。AiSidecarClient 统一加上 header。
- **前端→sidecar 直连**(role-config/propose / workstudy/draft-* 等通过 /ai/ 反代):
  必须带 Authorization,反向调 Java /api/v1/auth/me/perms 拿真实 role/perms,
  防止恶意 client 自己捏造 X-User-Role header。带 30s 短缓存控制 perf。

为什么不直接信 Header:
  X-User-Role / X-User-Id 都是 plain header,浏览器可以任意伪造。
  Authorization 才是 Sa-Token JWT,只能由 Java 兜底鉴权才算真鉴权。
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import Header, HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)


async def verify_internal_token(
    x_internal_token: str = Header(default=""),
) -> None:
    """内部调用鉴权 — Java 后端→sidecar 必须带 X-Internal-Token。"""
    expected = settings.internal_token
    if not expected or not x_internal_token or x_internal_token != expected:
        logger.warning("verify_internal_token failed (token_present=%s)", bool(x_internal_token))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )


# perms 缓存: token -> (expires_at, {"roles": [...], "perms": [...]})
_perms_cache: dict[str, tuple[float, dict[str, list[str]]]] = {}
_CACHE_TTL_SEC = 30.0


async def _fetch_perms_via_java(authorization: str) -> dict[str, list[str]]:
    """反向调 Java /api/v1/auth/me/perms 拿当前 user 的真实 roles + perms。

    失败抛 HTTPException(401)。
    """
    now = time.time()
    cached = _perms_cache.get(authorization)
    if cached and cached[0] > now:
        return cached[1]

    try:
        async with httpx.AsyncClient(
            base_url=settings.java_base_url, timeout=5.0, trust_env=False
        ) as c:
            r = await c.get(
                "/api/v1/auth/me/perms",
                headers={"Authorization": authorization},
            )
            if r.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="authorization 校验失败",
                )
            data = (r.json() or {}).get("data") or {}
            payload = {
                "roles": [str(x) for x in (data.get("roles") or [])],
                "perms": [str(x) for x in (data.get("perms") or [])],
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("verify_caller_user backend reach failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="鉴权后端暂不可用",
        )

    _perms_cache[authorization] = (now + _CACHE_TTL_SEC, payload)
    return payload


def require_roles(*allowed_roles: str):
    """生成一个 FastAPI Depends:Authorization 必须有效,且 role ∈ allowed_roles。

    示例:
        @router.post("/propose", dependencies=[Depends(require_roles("school_admin","super_admin"))])
    """
    allowed = set(allowed_roles)

    async def _dep(authorization: str = Header(default="")) -> dict[str, Any]:
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="缺少 Authorization",
            )
        payload = await _fetch_perms_via_java(authorization)
        roles = set(payload["roles"])
        if not (allowed & roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return payload

    return _dep


def require_logged_in():
    """Authorization 必须有效,不限角色。给 workstudy 类对所有登录用户开放的端点用。"""

    async def _dep(authorization: str = Header(default="")) -> dict[str, Any]:
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="缺少 Authorization",
            )
        return await _fetch_perms_via_java(authorization)

    return _dep
