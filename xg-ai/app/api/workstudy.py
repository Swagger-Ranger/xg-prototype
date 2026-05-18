"""勤工助学 AI 端点
- /draft-interview-notice         B2：面试通知文案
- /write-recommendation-reasons   B3：为每个推荐岗位写 1-2 句理由

两个端点都是纯函数式（无 DB / 无会话）；Java 端组装上下文后调用。
"""
import json
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import require_logged_in, verify_internal_token
from app.llm.deepseek import DeepSeekProvider
from app.llm.provider import ChatMessage

router = APIRouter(prefix="/workstudy", tags=["workstudy"])
logger = logging.getLogger(__name__)

llm = DeepSeekProvider()


class DraftInterviewNoticeReq(BaseModel):
    student_name: str = Field(..., min_length=1, max_length=64)
    position_title: str = Field(..., min_length=1, max_length=200)
    department_name: str | None = Field(default=None, max_length=200)
    # 已格式化的可读时间，例如 "2026-05-20 14:00"。前端传过来时已转好，避免在 LLM 端做时区
    interview_at: str = Field(..., min_length=1, max_length=64)
    interview_location: str = Field(..., min_length=1, max_length=200)
    # employer 端的口头备注（例如 "请带学生证"），可选；模型会自然带进去
    employer_note: str | None = Field(default=None, max_length=500)


class DraftInterviewNoticeResp(BaseModel):
    draft: str
    model: str = "unknown"
    error_message: str | None = None


_SYSTEM_PROMPT = (
    "你是高校用人单位（图书馆 / 实验室 / 行政办公室等）的写作助手。"
    "根据传入的面试基本信息，写一段给申请学生看的面试通知。\n\n"
    "## 输出要求\n"
    "- **完整且自包含**：含称呼、岗位、面试时间、地点；如有 employer 备注就自然融入\n"
    "- **一段连续文本**：1-3 句话，60-160 字\n"
    "- **友好而正式**：像辅导员对学生讲话，礼貌但不生分\n"
    "- **结尾一句鼓励**：祝面试顺利 / 表达期待\n"
    "- 不要写发件人署名、不要『此致敬礼』等套话\n"
    "- 直接输出文本，不要 markdown、不要引号包围、不要解释性开头\n\n"
    "## 严禁\n"
    "- 编造未给出的信息（薪资 / 岗位职责 / 面试官姓名等）\n"
    "- 写得过长（>200 字显得冗余）\n"
    "- 高姿态用词（如『必须』『不到则视为放弃』等）\n"
)


@router.post(
    "/draft-interview-notice",
    response_model=DraftInterviewNoticeResp,
    dependencies=[Depends(require_logged_in())],
)
async def draft_interview_notice(req: DraftInterviewNoticeReq) -> DraftInterviewNoticeResp:
    lines = [
        f"学生姓名：{req.student_name}",
        f"岗位：{req.position_title}",
    ]
    if req.department_name:
        lines.append(f"用人部门：{req.department_name}")
    lines.append(f"面试时间：{req.interview_at}")
    lines.append(f"面试地点：{req.interview_location}")
    if req.employer_note:
        lines.append(f"备注：{req.employer_note}")
    user_content = "\n".join(lines)

    try:
        result = await llm.chat([
            ChatMessage(role="system", content=_SYSTEM_PROMPT),
            ChatMessage(role="user", content=user_content),
        ])
        draft = (result.content or "").strip()
        if not draft:
            return DraftInterviewNoticeResp(
                draft="", model=result.model,
                error_message="LLM returned empty content",
            )
        return DraftInterviewNoticeResp(draft=draft, model=result.model)
    except Exception as e:
        logger.warning("draft_interview_notice failed: %s", e, exc_info=True)
        return DraftInterviewNoticeResp(
            draft="", model="unavailable",
            error_message="生成面试通知失败,请稍后再试",
        )


# ------------------------------------------------------------------
# P2.1 自荐说明草稿 — 学生申请岗位前，AI 起草一段自荐
# ------------------------------------------------------------------


class DraftApplyIntroReq(BaseModel):
    # 学生基本资料（前端从 useAuth + student_profile 组装）
    student_name: str = Field(..., min_length=1, max_length=64)
    grade: str | None = Field(default=None, max_length=32)        # 如 "大二"
    college: str | None = Field(default=None, max_length=128)
    major: str | None = Field(default=None, max_length=128)
    # 资助档次（一般 / 困难 / 特困 / 无），可选
    financial_aid_level: str | None = Field(default=None, max_length=32)
    # 岗位信息（前端从 position detail 直接传）
    position_title: str = Field(..., min_length=1, max_length=200)
    department_name: str | None = Field(default=None, max_length=200)
    position_type: str | None = Field(default=None, max_length=32)  # fixed / temporary
    position_description: str | None = Field(default=None, max_length=2000)
    # 学生偏好（可选；从 student_workstudy_preference 取，提供相关性）
    keywords: str | None = Field(default=None, max_length=128)


class DraftApplyIntroResp(BaseModel):
    draft: str
    model: str = "unknown"
    error_message: str | None = None


_INTRO_SYSTEM = (
    "你是高校学生工作平台的写作助手。帮学生写一段勤工助学岗位的『自荐说明』。\n\n"
    "## 输出要求\n"
    "- **80-180 字**，一段连续文本，1-3 句话\n"
    "- 第一人称『我』，朴素、真诚，不卖弄文采\n"
    "- 自然提到自己年级 / 学院 / 专业（如已给），但不要堆砌\n"
    "- 围绕岗位本身写为什么适合：能体现『靠谱、能持续投入、相关经验或意愿』\n"
    "- 如果有 financial_aid_level（一般/困难/特困），可以一句话提及希望通过勤工补贴生活\n"
    "- 结尾一句轻松的承诺（如『若有机会，会按时到岗、踏实负责』）\n"
    "- 不要写标题、不要 markdown、不要套话（『此致敬礼』『谢谢您的考虑』）\n"
    "- 直接输出文本，不要引号包围、不要『以下是...』开头\n\n"
    "## 严禁\n"
    "- 编造学生没给的事实（具体的奖学金 / 项目经历 / GPA 数字 / 社团职务）\n"
    "- 输出 >200 字\n"
    "- 输出超过 1 段（不要分行）\n"
)


@router.post(
    "/draft-apply-intro",
    response_model=DraftApplyIntroResp,
    dependencies=[Depends(require_logged_in())],
)
async def draft_apply_intro(req: DraftApplyIntroReq) -> DraftApplyIntroResp:
    lines = [f"学生姓名：{req.student_name}"]
    if req.grade:
        lines.append(f"年级：{req.grade}")
    if req.college:
        lines.append(f"学院：{req.college}")
    if req.major:
        lines.append(f"专业：{req.major}")
    if req.financial_aid_level:
        lines.append(f"资助档次：{req.financial_aid_level}")
    lines.append(f"申请岗位：{req.position_title}")
    if req.department_name:
        lines.append(f"用人部门：{req.department_name}")
    if req.position_type:
        lines.append(f"岗位类型：{'固定岗' if req.position_type == 'fixed' else '临时岗'}")
    if req.position_description:
        lines.append(f"岗位简介：{req.position_description[:500]}")
    if req.keywords:
        lines.append(f"学生偏好关键词：{req.keywords}")
    user_content = "\n".join(lines)

    try:
        result = await llm.chat([
            ChatMessage(role="system", content=_INTRO_SYSTEM),
            ChatMessage(role="user", content=user_content),
        ])
        draft = (result.content or "").strip()
        if not draft:
            return DraftApplyIntroResp(
                draft="", model=result.model,
                error_message="LLM returned empty content",
            )
        return DraftApplyIntroResp(draft=draft, model=result.model)
    except Exception as e:
        logger.warning("draft_apply_intro failed: %s", e, exc_info=True)
        return DraftApplyIntroResp(
            draft="", model="unavailable",
            error_message="自荐说明生成失败,请稍后再试",
        )


# ------------------------------------------------------------------
# B3 推荐理由 — 给每个候选岗位写一段 1-2 句话的"为什么推荐你"
# ------------------------------------------------------------------


class WriteReasonsReq(BaseModel):
    student: dict = Field(default_factory=dict)
    positions: list[dict] = Field(default_factory=list)


class WriteReasonsResp(BaseModel):
    reasons: dict[str, str] = Field(default_factory=dict)
    model: str = "unknown"
    error_message: str | None = None


_REASON_SYSTEM = (
    "你是高校学生工作平台的推荐解释器。Java 已经基于规则给学生算出了 Top 候选岗位 + 评分，"
    "你的任务是为每个岗位写一段 1-2 句的『为什么推荐你这个』的友好说明。\n\n"
    "## 输入\n"
    "学生 brief（aid_level / grade / college / preference）+ 多个候选岗位 brief（含 signals 评分维度）。\n\n"
    "## 输出（严格 JSON）\n"
    "{\"reasons\": {\"<position_id>\": \"<一段 1-2 句理由>\"}}\n"
    "- key 必须是字符串形式的 position_id，与输入对齐\n"
    "- 每条理由 40-90 字\n"
    "- 用第二人称『你』，亲切但不卖萌\n"
    "- 内容必须基于 signals / preference / aid 等实际维度，不能凭空编造\n"
    "- 不要写薪资 / 部门等岗位本身的客观信息（学生从卡片本身能看到）\n"
    "- 不要 markdown、不要解释、不要前后缀，仅输出顶层 JSON 对象\n\n"
    "## 撰写思路\n"
    "- aid_policy 命中（only/bonus/reserved）→ 强调岗位对困难生友好\n"
    "- campus_match / type_match → 强调『在你常去的校区』『你偏好的固定岗』\n"
    "- salary_in_range → 强调薪资符合你的预期范围\n"
    "- schedule_conflict 出现时不要推荐（Java 不会把它放进 Top）\n"
    "- signals 都缺 → 简单一句『岗位条件与你的基本资料匹配』\n"
)


@router.post(
    "/write-recommendation-reasons",
    response_model=WriteReasonsResp,
    dependencies=[Depends(verify_internal_token)],
)
async def write_recommendation_reasons(req: WriteReasonsReq) -> WriteReasonsResp:
    if not req.positions:
        return WriteReasonsResp(reasons={}, model="skip", error_message=None)
    user_payload = {
        "student": req.student,
        "positions": req.positions,
    }
    user_content = json.dumps(user_payload, ensure_ascii=False, default=str)
    try:
        # JSON 输出端点:低温度减少 hallucination 和 JSON 解析失败
        result = await llm.chat([
            ChatMessage(role="system", content=_REASON_SYSTEM),
            ChatMessage(role="user", content=user_content),
        ], temperature=0.2)
        text = (result.content or "").strip()
        # LLM 偶尔会包 ```json fence，剥一下
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        parsed = json.loads(text)
        reasons_raw = parsed.get("reasons", {})
        if not isinstance(reasons_raw, dict):
            return WriteReasonsResp(reasons={}, model=result.model, error_message="invalid reasons shape")
        reasons = {str(k): str(v) for k, v in reasons_raw.items() if isinstance(v, str)}
        return WriteReasonsResp(reasons=reasons, model=result.model)
    except json.JSONDecodeError as e:
        logger.warning("write_recommendation_reasons JSON decode failed: %s; raw=%s", e, result.content if 'result' in locals() else None)
        return WriteReasonsResp(reasons={}, model="unavailable", error_message="AI 输出格式异常")
    except Exception as e:
        logger.warning("write_recommendation_reasons failed: %s", e, exc_info=True)
        return WriteReasonsResp(reasons={}, model="unavailable", error_message="推荐理由生成失败")


# ------------------------------------------------------------------
# A4 自然语言报表 — 把 NL 翻成结构化 DSL + 一段摘要文本
# ------------------------------------------------------------------


class NlToReportReq(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    # 上下文：当前学年/月份/可选列字典，Java 端组装
    today: str | None = Field(default=None, max_length=32)
    academic_year: str | None = Field(default=None, max_length=16)
    allowed_columns: list[str] = Field(default_factory=list)


class NlToReportResp(BaseModel):
    title: str
    summary: str
    entity: str
    filters: dict = Field(default_factory=dict)
    columns: list[str] = Field(default_factory=list)
    model: str = "unknown"
    error_message: str | None = None


_NL_REPORT_SYSTEM = (
    "你是高校学工系统的 NL→报表 DSL 翻译器。把用户中文报表需求转换成结构化 DSL。\n\n"
    "## 输出（严格 JSON，无其它内容）\n"
    "{\n"
    "  \"title\":   \"短中文标题（≤20 字）\",\n"
    "  \"summary\": \"一段 30-80 字摘要，描述本表内容（基于 filter/column，不要凭空猜数据）\",\n"
    "  \"entity\":  \"application\",  // P0 仅 application\n"
    "  \"filters\": {...},  // 仅用白名单 key\n"
    "  \"columns\": [...]   // 必须是白名单子集，按合理顺序\n"
    "}\n\n"
    "## filters 白名单\n"
    "- status:            pending / hired / rejected / recommended\n"
    "- engagement_status: on_duty / offboarded\n"
    "- position_id:       数字（用户提供时）\n"
    "- student_id:        数字\n"
    "- from_date / to_date: YYYY-MM-DD\n"
    "- month:             YYYY-MM\n"
    "- academic_year:     2024-2025 这样\n\n"
    "## columns 白名单\n"
    "上下文里会给你完整 allowed_columns；仅从里面选。如果用户只说『简洁』就给\n"
    "[student_name, position_title, status, decided_at]；说『全部』就给完整 allowed_columns。\n\n"
    "## 关键约束\n"
    "- 用户没明确说筛选条件就不要瞎加（filters 可以为空 {}）\n"
    "- 不能输出 allowed_columns 之外的字段名\n"
    "- summary 不要写『本月录用了 X 人』这种具体数字（你不知道数据）\n"
    "- 写『本表导出当前学年所有在岗学生及其岗位、到岗时间』这种描述性话\n"
    "- 不能用 markdown、不能用代码块、必须是纯顶层 JSON\n"
)


@router.post(
    "/nl-to-report",
    response_model=NlToReportResp,
    dependencies=[Depends(require_logged_in())],
)
async def nl_to_report(req: NlToReportReq) -> NlToReportResp:
    ctx_lines = [f"用户需求：{req.query}"]
    if req.today:
        ctx_lines.append(f"今天日期：{req.today}")
    if req.academic_year:
        ctx_lines.append(f"当前学年：{req.academic_year}")
    if req.allowed_columns:
        ctx_lines.append(f"allowed_columns：{', '.join(req.allowed_columns)}")
    user_content = "\n".join(ctx_lines)

    try:
        # JSON DSL 翻译:低温度避免乱编 filter / column,降低 JSON 格式错误率
        result = await llm.chat([
            ChatMessage(role="system", content=_NL_REPORT_SYSTEM),
            ChatMessage(role="user", content=user_content),
        ], temperature=0.2)
        text = (result.content or "").strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        parsed = json.loads(text)
        allowed_set = set(req.allowed_columns or [])
        columns_raw = parsed.get("columns", []) or []
        columns = [c for c in columns_raw if isinstance(c, str) and (not allowed_set or c in allowed_set)]
        filters = parsed.get("filters") or {}
        if not isinstance(filters, dict):
            filters = {}
        return NlToReportResp(
            title=str(parsed.get("title") or "勤工助学报表"),
            summary=str(parsed.get("summary") or ""),
            entity=str(parsed.get("entity") or "application"),
            filters=filters,
            columns=columns,
            model=result.model,
        )
    except json.JSONDecodeError as e:
        logger.warning("nl_to_report JSON decode failed: %s", e)
        return NlToReportResp(
            title="勤工助学报表", summary="", entity="application", filters={}, columns=[],
            model="unavailable", error_message="AI 输出格式异常,请换种说法再试",
        )
    except Exception as e:
        logger.warning("nl_to_report failed: %s", e, exc_info=True)
        return NlToReportResp(
            title="勤工助学报表", summary="", entity="application", filters={}, columns=[],
            model="unavailable", error_message="自然语言报表生成失败,请稍后再试",
        )
