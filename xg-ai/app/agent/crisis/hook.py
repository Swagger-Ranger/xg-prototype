"""chat.py 的危机前置钩子（跑在 LLM 调用之前，设计 §4.1）。

`maybe_handle_crisis` 命中显式求助 → 旁路回调 Java（best-effort）+ 返回**固定支持卡**
（非 LLM 生成），由 chat.py 直接短路返回、不进 LLM。两件事互不依赖（设计 §0）：
即便回调失败，学生侧仍拿到支持卡。

**默认关闭**（settings.crisis_enabled=False）→ 永远返回 None，正常 chat 零影响。
全程 fail-safe：本模块任何异常都降级为 None（回退正常 chat），并响亮记日志。
"""
import logging
import uuid

from app.agent.crisis import detector, notify
from app.config import settings

logger = logging.getLogger(__name__)

# 学生侧固定支持卡 —— **占位草稿，D4（心理中心）未定稿前不是终稿**。
# 设计 §4.1/§4.3：确定性、非 LLM 生成、零诊断词、传递"你不是一个人"+ 明确下一步 +
# 求助资源。热线号/值班机制由 D4 提供，此处不臆造具体号码。
SUPPORT_CARD = (
    "我在。你愿意说出来，这一步很重要——你不是一个人。\n"
    "如果此刻很难熬，请尽快联系你的辅导员，或拨打学校心理支持热线/全国心理援助热线。\n"
    "（具体热线与值班联系方式待心理中心配置后在此展示。）"
)


async def maybe_handle_crisis(
    message: str | None,
    authorization: str,
    tenant_id: str,
) -> str | None:
    """命中 → 返回固定支持卡文案（并已触发旁路回调）；未命中/关闭/出错 → None。"""
    try:
        if not settings.crisis_enabled:
            return None
        hit = detector.detect(message)
        if hit is None:
            return None

        # 每条入站消息生成稳定 message_id（不要求消息持久化，设计 §4.1）
        message_id = uuid.uuid4().hex
        # 旁路回调 best-effort：失败不阻断学生侧支持卡（设计 §0 两件互不依赖）
        ok = await notify.report(message_id, hit.rule_version, authorization, tenant_id)
        if not ok:
            logger.error(
                "CRISIS side-channel not confirmed (loud) msg_id=%s —— "
                "学生侧支持卡照常返回，人工通知未确认",
                message_id,
            )
        return SUPPORT_CARD
    except Exception as e:  # noqa: BLE001 - fail-safe: never break normal chat
        logger.error("crisis hook error, falling back to normal chat: %s", e)
        return None
