"""xg-ai → Java 危机回调（旁路，与学生侧支持卡解耦，设计 §4.1-§4.2）。

铁律：**fail-safe** —— 任何异常都不得抛回 chat 流程（学生侧支持卡照常返回）；
回调失败 = 响亮记日志，留待运维/Java 侧补偿，但不阻断学生体验。
身份不在此自报：只转发已认证学生 token，由 Java 重校验解析 student_id（设计 §4.1）。
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_ENDPOINT = "/internal/crisis/signal"


async def report(
    message_id: str,
    rule_version: str,
    authorization: str,
    tenant_id: str,
) -> bool:
    """回调 Java 落 crisis_signal + 发通知。返回是否成功；绝不抛异常。"""
    headers = {
        "X-Internal-Token": settings.internal_token,
        # 转发学生已认证 token —— Java 用它重校验解析受害学生身份，不信自报
        "Authorization": authorization or "",
    }
    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id
    try:
        async with httpx.AsyncClient(
            base_url=settings.java_base_url, timeout=5.0, trust_env=False
        ) as client:
            # Java 全局 Jackson SNAKE_CASE：键必须 snake_case（message_id/rule_version），
            # 否则绑定为 null → Java 端 BAD_REQUEST 400。
            resp = await client.post(
                _ENDPOINT,
                json={"message_id": message_id, "rule_version": rule_version},
                headers=headers,
            )
        if resp.status_code == 200:
            return True
        logger.error(
            "CRISIS callback non-200 (loud): status=%s msg_id=%s —— "
            "Java 侧未确认落库/通知，需运维介入",
            resp.status_code,
            message_id,
        )
        return False
    except Exception as e:  # noqa: BLE001 - fail-safe by design
        logger.error(
            "CRISIS callback FAILED (loud): %s msg_id=%s —— "
            "学生侧支持卡仍照常返回，但人工通知未发出，需运维介入",
            e,
            message_id,
        )
        return False
