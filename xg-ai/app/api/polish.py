"""文本润色端点 — 把教师/管理员手写的"驳回理由"草稿改写成对学生友好、
专业、可执行的措辞。是一个纯函数式调用，不走聊天会话、不调任何 query_*
工具，避免与 chat 路径的 system prompt 互相污染。
"""
import logging
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.llm.deepseek import DeepSeekProvider
from app.llm.provider import ChatMessage

router = APIRouter(prefix="/polish", tags=["polish"])
logger = logging.getLogger(__name__)

llm = DeepSeekProvider()


class PolishRejectionReq(BaseModel):
    draft: str = Field(..., min_length=1, max_length=2000, description="教师写的草稿")
    # 给 LLM 上下文：节点 / 学生名 / 类型 / 时长 / 学生原文 reason 等。
    # 1500 字够装进学生写的几百字 reason，不再放 form_data 等次要字段。
    context: str | None = Field(default=None, max_length=1500)


class PolishRejectionResp(BaseModel):
    polished: str
    model: str = "unknown"
    error_message: str | None = None


_SYSTEM_PROMPT = (
    "你是辅导员的写作助手。把老师写的「驳回意见」草稿改写成给学生看的最终评语。\n\n"
    "## 输出要求\n"
    "- **包含两层信息**：① 为什么驳回（具体哪里不符合）② 学生可以怎么改（下一步动作）\n"
    "- **是一段连续的话**，不要分点、不要小标题、不要「原因：」/「建议：」这种前缀\n"
    "- **专业但不冷峻**：客观陈述事实，不批评、不命令\n"
    "- **简洁**：1-3 句话，不超过 120 字\n"
    "- 不要写问候语，不要写「以下是改写」「修改如下」等冗余开头\n"
    "- 直接输出最终文本，不要 markdown、不要引号包围\n\n"
    "## 边界（硬约束，不可越界）\n"
    "驳回的依据**只能**是上下文里的客观/程序性事实，例如：\n"
    "- 时长超出当前审批节点权限（如「7 天超出辅导员审批权」）\n"
    "- 缺必要材料（住院证明 / 行程证明 / 比赛通知 …）\n"
    "- 缺必填字段（紧急联系人 / 目的地 / 起止时间不连续）\n"
    "- 类型选错（事假与实际事由不匹配的归类问题，但不要质疑事由本身）\n\n"
    "**严禁**：\n"
    "- 评判学生陈述的事实是否合理（如「爷爷住院通常不需要 X 天」「这种情况一般几天就够」）— 系统不掌握学生家事实情，无权评断\n"
    "- 替学生做生活/家庭判断\n"
    "- 质疑事由的真实性、紧迫性、必要性\n\n"
    "## 建议方向（只从这几类里选，覆盖学生实际能做的下一步）\n"
    "- 补充证明材料并重新提交\n"
    "- 与辅导员/班主任当面沟通\n"
    "- 提供家长联系方式 / 联系家长确认\n"
    "- 走更高级别审批通道（如院系 / 学工处）\n"
    "- 修改具体字段后重新提交（指明哪个字段）\n\n"
    "如果教师草稿信息不足以判断具体程序问题，宁可写得通用（如「请补充相关证明材料后重新提交」），**也不要**无中生有评判学生陈述。\n"
)


@router.post("/rejection", response_model=PolishRejectionResp)
async def polish_rejection(req: PolishRejectionReq) -> PolishRejectionResp:
    user_content = req.draft.strip()
    if req.context:
        user_content = f"上下文：{req.context.strip()}\n\n草稿：{user_content}"
    try:
        result = await llm.chat([
            ChatMessage(role="system", content=_SYSTEM_PROMPT),
            ChatMessage(role="user", content=user_content),
        ])
        polished = (result.content or "").strip()
        if not polished:
            return PolishRejectionResp(
                polished=req.draft, model=result.model,
                error_message="LLM returned empty content",
            )
        return PolishRejectionResp(polished=polished, model=result.model)
    except Exception as e:
        logger.warning("polish_rejection failed: %s", e, exc_info=True)
        # 不抛 500，回退到原始草稿，前端 UI 不阻塞
        return PolishRejectionResp(
            polished=req.draft, model="unavailable",
            error_message=f"polish error: {e}",
        )
