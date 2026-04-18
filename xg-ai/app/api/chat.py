import uuid
import logging
from datetime import date
from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.llm.deepseek import DeepSeekProvider
from app.rag.knowledge import format_context
from app.rag.retriever import retrieve_semantic
from app.tool import query_tools

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)

llm = DeepSeekProvider()

SYSTEM_PROMPT = (
    "你是学工管理系统的 AI 助手。今天是 {today}。\n"
    "你的风格简洁友好，每次回复尽量1-2句话。\n\n"
    "## 核心原则：先对话收集，信息齐全后再操作\n\n"
    "### 请假流程（严格三步）\n"
    "请假需要4个要素：假别、开始日期、结束日期、事由。\n"
    "收集：评估用户已给的信息。缺少哪些要素就追问哪些，一次最多问2个。日期要转换为具体日期（\"明天\"→具体日期）。\n"
    "确认：当4个要素全部明确后（可能用户第一句就给齐了），回复确认摘要，格式例如：\"事假，4月18日一天，事由：家里有事，确认提交吗？\"。这一步只发纯文字，不调用任何工具。不要在回复前加\"确认：\"之类的前缀。\n"
    "执行：用户回复肯定词（好/对/嗯/可以/是/提交/确认/没问题）后，这一轮才调用 open_leave_form 并填入所有参数。\n"
    "关键：确认和执行必须在不同轮次。同一轮不能既确认又调用工具。\n\n"
    "### 签到流程\n"
    "签到需要：活动标题、时长。缺少时追问，齐全后确认再调用 open_checkin_form。\n\n"
    "### 信息收集流程\n"
    "收集需要：标题。缺少时追问，齐全后确认再调用 open_collection_form。\n\n"
    "### 投诉/诉求流程（严格三步）\n"
    "用户说\"投诉/诉求/反映问题/提意见\"时，走和请假一样的收集→确认→执行流程。\n"
    "投诉需要3个要素：标题（简短）、类别（教学管理/后勤服务/校园安全/其他）、内容。\n"
    "收集：评估用户已给的信息。缺少哪些要素就追问哪些，一次最多问2个。能从用户描述中提炼出标题和类别时就直接用，不必追问。\n"
    "确认：3个要素齐全后，回复确认摘要，例如：\"诉求：教学楼空调坏了（后勤服务），内容：北404教室空调不制冷。确认提交吗？\"。这一步只发纯文字，不调用工具。\n"
    "执行：用户确认后再调用 open_complaint_form。类别参数必须是枚举值 teaching/logistics/safety/other。\n\n"
    "### 导航\n"
    "用户明确说去某个页面时，直接调用 navigate，无需确认。\n\n"
    "### 其他\n"
    "与系统功能无关的问题，正常用简洁中文回答。\n"
    "不要编造系统没有的功能。可用功能：请销假、签到、信息收集、通知任务、接诉即办、学生信息、知识问答。"
)

# UI-side tools: the LLM emits one, chat.py emits action, frontend opens a modal.
# Query tools live in query_tools.TOOLS (role-filtered at request time).
UI_TOOLS = [
    {
        "name": "navigate",
        "description": "导航到系统的指定功能页面",
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": ["workspace", "leave", "collection", "checkin", "notification", "complaint", "student", "knowledge"],
                    "description": "目标页面",
                }
            },
            "required": ["page"],
        },
        "allowed_roles": None,
    },
    {
        "name": "open_leave_form",
        "description": "打开请假申请表单，可预填信息。当用户说要请假、帮我请假时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "leave_type": {
                    "type": "string",
                    "enum": ["sick_on_campus", "sick_off_campus", "personal", "weekend", "official"],
                    "description": "假别: sick_on_campus=病假(在校), sick_off_campus=病假(离校), personal=事假, weekend=周末离校, official=公假",
                },
                "reason": {"type": "string", "description": "请假原因"},
                "start_date": {"type": "string", "description": "开始日期 YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "结束日期 YYYY-MM-DD"},
            },
        },
        "allowed_roles": None,
    },
    {
        "name": "open_checkin_form",
        "description": "打开创建签到活动的表单。当用户说要创建签到、发起签到时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "签到活动标题"},
                "duration_minutes": {"type": "integer", "description": "签到时长(分钟)"},
            },
        },
        "allowed_roles": {"counselor", "dean", "school_admin"},
    },
    {
        "name": "open_collection_form",
        "description": "打开创建信息收集单的表单。当用户说要发起收集、创建收集单时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "收集单标题"},
            },
        },
        "allowed_roles": {"counselor", "dean", "school_admin"},
    },
    {
        "name": "open_complaint_form",
        "description": "打开接诉即办/诉求提交表单，可预填标题、类别、内容。当用户说要投诉、反映问题、提诉求时，收集齐要素并确认后调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "诉求标题（简短）"},
                "category": {
                    "type": "string",
                    "enum": ["teaching", "logistics", "safety", "other"],
                    "description": "类别：teaching=教学管理, logistics=后勤服务, safety=校园安全, other=其他",
                },
                "content": {"type": "string", "description": "诉求详细内容"},
                "anonymous": {"type": "boolean", "description": "是否匿名提交，默认 false"},
            },
        },
        "allowed_roles": None,
    },
]


def _build_tools(role: str) -> list[dict]:
    """Merge UI tools (role-filtered) with query tools (role-filtered per registry)."""
    ui = [
        {k: v for k, v in t.items() if k != "allowed_roles"}
        for t in UI_TOOLS
        if t["allowed_roles"] is None or role in t["allowed_roles"]
    ]
    return ui + query_tools.tools_for_role(role)


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    history: list[dict] | None = None
    current_page: str | None = None
    current_modal: str | None = None
    user_role: str | None = None
    user_name: str | None = None


class ActionPayload(BaseModel):
    type: str
    data: dict | None = None


class Citation(BaseModel):
    doc_id: str
    title: str


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    action: ActionPayload | None = None
    citations: list[Citation] | None = None


@router.post("/chat")
async def global_chat(
    req: ChatRequest,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default=""),
) -> ChatResponse:
    conv_id = req.conversation_id or uuid.uuid4().hex

    system_prompt = SYSTEM_PROMPT.format(today=date.today().isoformat())

    role_labels = {
        "student": "学生",
        "counselor": "辅导员",
        "dean": "院系领导",
        "school_admin": "校级管理员",
    }
    role_label = role_labels.get(req.user_role or "student", "用户")
    user_display = f"{req.user_name}（{role_label}）" if req.user_name else role_label
    system_prompt += f"\n\n## 当前用户\n你正在与{user_display}对话。请根据其角色提供对应的服务。\n"
    if req.user_role == "student":
        system_prompt += "- 学生用户：请假是为自己请假，可以查询自己的请假记录、通知等。\n"
        system_prompt += "- 不要提供管理功能（审批、统计、签到管理等）。\n"
    elif req.user_role in ("counselor", "dean", "school_admin"):
        system_prompt += "- 教师/管理员用户：请假相关操作是代学生请假。需要先问清楚为哪位同学请假。\n"
        system_prompt += "- 可以使用所有管理功能：审批、签到、信息收集、通知等。\n"

    page_labels = {
        "workspace": "工作台", "leave": "请销假", "collection": "信息收集",
        "checkin": "签到", "notification": "通知任务", "complaint": "接诉即办",
        "student": "学生信息", "knowledge": "知识问答",
    }
    if req.current_page:
        page_label = page_labels.get(req.current_page, req.current_page)
        system_prompt += f"\n## 当前页面\n用户正在「{page_label}」页面"
        if req.current_modal:
            system_prompt += f"，打开的弹窗：{req.current_modal}"
        system_prompt += "。\n- 若用户要执行的操作正是当前页面的功能，直接调用对应表单工具（如 open_*_form），不用再 navigate。\n- 若用户明显在换话题，按正常流程处理。\n"

    rag_articles = await retrieve_semantic(req.message)
    if rag_articles:
        system_prompt += format_context(rag_articles)

    tools = _build_tools(req.user_role or "student")

    convo: list[dict] = [{"role": "system", "content": system_prompt}]
    if req.history:
        for h in req.history:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                convo.append({"role": h["role"], "content": h["content"]})
    convo.append({"role": "user", "content": req.message})

    MAX_ITERS = 5
    action: ActionPayload | None = None
    reply = ""
    tool_ran = False

    try:
        for _ in range(MAX_ITERS):
            turn = await llm.chat_native(messages=convo, tools=tools)

            # UI-side tool (open_*_form / navigate) wins immediately — emit action and stop.
            ui_tool = next(
                (tc for tc in turn.tool_calls if tc.name not in query_tools.HANDLERS),
                None,
            )
            if ui_tool:
                action = ActionPayload(type=ui_tool.name, data=ui_tool.input)
                reply = turn.text
                break

            # No tool calls — plain text answer, done.
            if not turn.tool_calls:
                reply = turn.text
                break

            # All tool_calls are read-only query_* — run them and loop.
            tool_ran = True
            convo.append(turn.assistant_message)
            for tc in turn.tool_calls:
                output = await query_tools.execute(
                    tc.name, tc.input,
                    user_id=x_user_id, tenant_id=x_tenant_id,
                    user_role=req.user_role or "student",
                )
                convo.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": output,
                })
        else:
            # Loop exited by exhausting MAX_ITERS without a text answer.
            if not reply:
                reply = "查询过程过长，已中止。请换一种提问方式。"

        if not (reply or "").strip() and action:
            reply = _action_reply(action)

        citations: list[Citation] | None = None
        if rag_articles and not tool_ran:
            seen: set[str] = set()
            citations = []
            for a in rag_articles:
                if a.doc_id in seen:
                    continue
                seen.add(a.doc_id)
                citations.append(Citation(doc_id=a.doc_id, title=a.doc_title))
            citations = citations or None
        return ChatResponse(reply=reply, conversation_id=conv_id, action=action, citations=citations)
    except Exception:
        logger.exception("LLM call failed")
        return ChatResponse(reply="AI 服务暂时不可用，请稍后重试。", conversation_id=conv_id)


def _action_reply(action: ActionPayload) -> str:
    """Generate a user-friendly reply for an action."""
    t = action.type
    d = action.data or {}
    if t == "navigate":
        labels = {
            "workspace": "工作台", "leave": "请销假", "collection": "信息收集",
            "checkin": "签到", "notification": "通知任务", "complaint": "接诉即办",
            "student": "学生信息", "knowledge": "知识问答",
        }
        return f"好的，已为您跳转到「{labels.get(d.get('page', ''), d.get('page', ''))}」页面。"
    elif t == "open_leave_form":
        return "好的，已为您打开请假申请表单" + (f"，已预填事由：{d['reason']}" if d.get("reason") else "") + "。"
    elif t == "open_checkin_form":
        return "好的，已为您打开创建签到活动表单。"
    elif t == "open_collection_form":
        return "好的，已为您打开创建信息收集单表单。"
    elif t == "open_complaint_form":
        return "好的，已为您打开诉求提交表单" + (f"：{d['title']}" if d.get("title") else "") + "。"
    return "操作已执行。"
