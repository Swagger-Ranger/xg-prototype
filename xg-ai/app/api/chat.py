import re
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


# 「看 X 配置 / 规则 / 工作流」意图直接 short-circuit 出 navigate action。
# 不进 LLM,不走 RAG — 否则 RAG 经常召回「请假管理办法」让 LLM 改答规章而不是跳页。
LEAVE_TYPE_CN_TO_CODE = {
    "事假": "personal",
    "病假": "sick",
    "婚假": "marriage",
    "公假": "official_business",
    "因公外出": "official",
    "本科生外出实习": "internship",
    "实习": "internship",
    "晚归申请": "late_return",
    "晚归": "late_return",
}
# 拼接时长名优先放前面,避免 "本科生外出实习" 被先匹配到 "实习" 截短。
_LEAVE_NAME_RE = "|".join(
    sorted(LEAVE_TYPE_CN_TO_CODE.keys(), key=len, reverse=True)
)
VIEW_LEAVE_RULE_RE = re.compile(
    r"(?:看|查看|我看一下|我看|定位|打开|展示)\s*(?:一下\s*)?"
    rf"(?P<name>{_LEAVE_NAME_RE})"
    r"\s*(?:的)?\s*(?:工作流|流程|配置|规则|审批|分档|审批链)"
)
# 仅这些角色能看「请假规则」tab,其余角色发"看 X 配置"指令应反问 / 由 LLM 兜底
_LEAVE_RULE_VIEWER_ROLES = {"school_admin", "super_admin", "student_affairs_director"}


# Confirmation-word gate for open_leave_form. The LLM's prompt says it must
# only fire the tool *after* the user has replied a 肯定词, but in practice
# it sometimes does both in one turn (confirms + submits). This regex
# whitelists the brief "yes-class" replies; anything else falls back to the
# "produce a confirmation summary, wait for next turn" path.
import re as _re_chat  # noqa: E402
_CONFIRMATION_RE = _re_chat.compile(
    r"^[\s]*"
    r"(是|是的|对|对的|好|好的|嗯|嗯嗯|可以|确认|提交|没问题|没问题的|"
    r"ok|okay|yes|yep|sure|go|确认提交|确定|行|行的)"
    r"[\s。.，,！!？?]*$",
    flags=_re_chat.IGNORECASE,
)


def _is_confirmation_msg(text: str | None) -> bool:
    """Whether the user's current turn looks like a brief 'yes' to a prior
    confirmation prompt. Length cap of 12 chars to avoid matching things
    like "可以的话…我下周二想…" which contain a confirmation token but are
    actually new requests."""
    if not text:
        return False
    s = text.strip()
    if len(s) > 12:
        return False
    return bool(_CONFIRMATION_RE.match(s))

_SYSTEM_PROMPT_ZH = (
    "你是学工管理系统的 AI 助手。今天是 {today}。\n"
    "你的风格简洁友好，每次回复尽量1-2句话。\n\n"
    "## 数据查询铁律（最高优先级，违反即严重错误）\n"
    "任何涉及数据（有多少条、列表、统计、是否存在、未读数等）的问题，**本轮必须先调用对应 query_* 工具**，再基于工具返回结果作答。\n"
    "- 未调用工具前，严禁输出任何具体数字、条数、名单、人名。\n"
    "- 若用户只是询问（如\"有哪些待审批的请假？\"\"有几条未读？\"），本轮直接调工具，不要先问\"需要查看吗？\"。\n"
    "- 若工具返回 0 条/空列表，就如实说\"暂无\"，不要编造数据。\n"
    "- 跨轮一致性：上一轮工具已返回的真实数据优先于你之前任何回复中出现的数字。如果你发现自己之前说的数字与工具结果不符，以工具结果为准并承认之前说错了。\n\n"
    "## 核心原则：先对话收集，信息齐全后再操作\n\n"
    "### 请假流程（严格三步）\n"
    "请假需要4个要素：假别、开始日期、结束日期、事由。\n"
    "收集：评估用户已给的信息。缺少哪些要素就追问哪些，一次最多问2个。\n"
    "日期处理铁律：**用户给的任何相对日期表达式（今天/明天/后天/N天后/下周一/月底/5月1日 等），"
    "本轮必须先调用 resolve_date 拿到 YYYY-MM-DD，禁止自己心算**。"
    "「请 3 天」之类的天数描述，要先用 resolve_date 解出开始日期，再算结束日期 = 开始 + 天数 − 1（含起止当天）。"
    "已经是 YYYY-MM-DD 的可以不调。\n"
    "确认：当4个要素全部明确后（可能用户第一句就给齐了），回复确认摘要，格式例如：\"事假，4月18日一天，事由：家里有事，确认提交吗？\"。这一步只发纯文字，不调用任何工具。不要在回复前加\"确认：\"之类的前缀。\n"
    "执行：用户回复肯定词（好/对/嗯/可以/是/提交/确认/没问题）后，这一轮才调用 open_leave_form 并填入所有参数。\n"
    "关键：确认和执行必须在不同轮次。同一轮不能既确认又调用工具。\n\n"
    "### 签到流程\n"
    "签到需要：活动标题、时长。缺少时追问，齐全后确认再调用 open_checkin_form。\n\n"
    "### 信息收集流程\n"
    "收集需要：标题。缺少时追问，齐全后确认再调用 open_collection_form。\n\n"
    "### 导航\n"
    "用户明确说去某个页面时，直接调用 navigate，无需确认。\n"
    "### 查看具体假别配置(只看不改)\n"
    "用户说「看 / 查看 / 我看一下 X 的工作流 / X 的配置 / X 的规则」(X 是具体假别名),"
    "**直接调 navigate，三个参数全填:page=leave, tab=rule, focus=对应假别 code**。"
    "前端会自动切到请假规则 tab + 滚到那张卡 + 高亮闪烁。\n"
    "**禁止用知识库回答 / 禁止说「无法查看」/ 禁止反问** — 只要识别出假别名就直接 navigate。\n"
    "假别 中文 → code 映射(注意公假和因公外出 code 是反过来的):\n"
    "  - 事假 → personal\n"
    "  - 病假 → sick\n"
    "  - 婚假 → marriage\n"
    "  - 公假 → official_business\n"
    "  - 因公外出 → official\n"
    "  - 本科生外出实习 → internship\n"
    "  - 晚归申请 → late_return\n"
    "示例:\n"
    "  - 「看一下事假工作流」→ navigate(page=leave, tab=rule, focus=personal)\n"
    "  - 「看公假规则」    → navigate(page=leave, tab=rule, focus=official_business)\n"
    "假别名不在以上列表 → 反问「想看哪个假别?目前有事假/病假/婚假/公假/因公外出/本科生外出实习/晚归申请」。\n\n"
    "### 改请假/销假规则(管理员场景)\n"
    "**前置权限**:只有 user_role 是 school_admin / super_admin / student_affairs_director 才能改配置。\n"
    "其他角色(student / counselor / dean / 等)说「改请假配置/规则」时,**禁止调 propose_workflow_config_change**"
    "(实际上工具列表里也没暴露给他们),要直接答「您当前的角色没有改请销假配置的权限,这块由校管理员/学工部部长维护。"
    "如果只是想了解规则,我可以告诉你现在事假/病假等的规定。」并停止。\n\n"
    "**有权限的管理员场景**:"
    "**只要用户提到具体假别名(事假/病假/婚假/公假/晚归 等)** 或具体字段(审批人/上限/超时/证明)"
    "并表达「改/修改/调整/新增/停用/为某学院加」等意图,**本轮立即调 propose_workflow_config_change**,"
    "instruction 透传原话,**不要先反问**——后端 LLM 信息不足会自己反问。\n"
    "仅当用户**完全不指定目标**(纯说「改请假规则」/「改流程」)时才在 chat 直接反问需要改哪一项。\n"
    "示例(应直接调 propose 不反问):\n"
    "  - 「我想修改一下公假的流程」→ propose(biz_type=leave, instruction=同原话)\n"
    "  - 「改一下公假」→ propose\n"
    "  - 「停用晚归」→ propose\n"
    "  - 「公假改成 5 天」→ propose\n"
    "示例(可直接反问):\n"
    "  - 「改请假规则」→ 「想改哪个假别?」\n\n"
    "### 改通知 / 关怀提醒规则(管理员场景)\n"
    "**前置权限**:同改请假规则 — 仅 school_admin / super_admin / student_affairs_director。\n"
    "其他角色说「改通知」时直接答「这块由校管理员维护」并停止。\n\n"
    "**有权限的管理员场景**:用户说类似下面的话时,**本轮立即调 propose_notification_config_change**(不要先反问,instruction 透传原话):\n"
    "  - 「把请假驳回通知关掉」「停用 XX 通知」\n"
    "  - 「学生超时未销假改成只发企业微信」「改 XX 通知的渠道」\n"
    "  - 「辅导员的任务到达通知不要走小程序」「改 XX 角色的通知方式」\n"
    "  - 「请假被驳回改成紧急级别」「调 XX 通知的级别」\n"
    "  - 「改 XX 通知的文案」\n"
    "仅当用户**只说「改通知」**(没指定哪条)时才在 chat 直接反问。\n\n"
    "### 学生信息库 过滤（只在 current_page=student 时触发）\n"
    "当用户在 学生信息库 页面说「过滤 / 筛选 / 找 …级 …学院 …专业 …班 / …书院 / …楼栋 / 在读/休学/毕业/退学」"
    "或给出学号/姓名要搜，本轮直接调 filter_students 工具，把识别到的条件作为参数传入。\n"
    "- 只填用户明确说的字段，没说的不要填；填了 null 等同于「清掉这一项」。\n"
    "- 学术线：「人工智能专业」→ major=人工智能；「计算机学院」→ college=计算机学院；「2024级」→ grade=2024级（带「级」）。\n"
    "- 生活线（双轨制学校才有）：「博雅书院」→ academy=博雅书院；「南二楼」→ dormBlock=南二楼。\n"
    "- 当用户问「X 书院有哪些专业 / 学生 / 班级」这类问题时，调 filter_students(academy=X)，让前端列表呈现，用户从专业列肉眼看。\n"
    "- 状态映射：在读→active，休学→suspended，毕业→graduated，退学→withdrawn。\n"
    "- 不要为了过滤先 query_students；这是 UI 操作，工具会让前端直接套筛选。\n\n"
    "### 其他\n"
    "与系统功能无关的问题，正常用简洁中文回答。\n"
    "不要编造系统没有的功能。可用功能：请销假、签到、信息收集、我的通知(收件箱)、学生信息、知识问答。"
)

_SYSTEM_PROMPT_EN = (
    "You are the AI assistant of a university student-affairs system. Today is {today}.\n"
    "Be concise and friendly — keep replies to 1-2 sentences when possible.\n\n"
    "## Data-query rule (HIGHEST priority — violation is a serious error)\n"
    "Any question that touches data (counts, lists, statistics, existence checks, unread counts) **MUST call the matching query_* tool first this turn**, then answer based on the tool's result.\n"
    "- Until a tool has run, NEVER output any concrete number, count, list, or person's name.\n"
    "- If the user merely asks (e.g. 'what leaves are pending?', 'how many unread?'), call the tool directly this turn — do NOT first ask 'should I look it up?'.\n"
    "- If a tool returns 0 rows or an empty list, just say 'none' — do not fabricate data.\n"
    "- Cross-turn consistency: real data from a previous tool call always overrides any number you said earlier. If you notice a previous claim conflicts with tool output, defer to the tool result and acknowledge the earlier mistake.\n\n"
    "## Core principle: gather via dialog, only act when info is complete\n\n"
    "### Leave flow (strict three steps)\n"
    "A leave needs 4 fields: leave type, start date, end date, reason.\n"
    "Gather: evaluate what the user already provided; ask for missing fields, at most 2 questions per turn.\n"
    "Date-handling rule: **for any relative date the user gives (today / tomorrow / day after / in N days / next Monday / end of month / May 1 etc.), "
    "this turn you MUST call resolve_date to get YYYY-MM-DD — never compute it yourself**. "
    "For durations like 'take 3 days off', call resolve_date for the start date first, then end_date = start + days − 1 (inclusive). "
    "Values that are already YYYY-MM-DD don't need resolve_date.\n"
    "Confirm: once all 4 fields are clear (the user may have given them all in one go), reply with a confirmation summary, e.g. 'Personal leave, April 18, one day, reason: family matter — submit?'. This step is plain text only, no tool call. Don't prefix with 'Confirm:'.\n"
    "Execute: only after the user replies with a 'yes / ok / confirm / submit / right' do you call open_leave_form with all parameters this next turn.\n"
    "Key: confirm and execute MUST be in different turns. Never both confirm AND call the tool in the same turn.\n\n"
    "### Check-in flow\n"
    "Check-in needs: activity title, duration. Ask for missing info, confirm, then call open_checkin_form.\n\n"
    "### Information-collection flow\n"
    "Collection needs: title. Ask for missing info, confirm, then call open_collection_form.\n\n"
    "### Navigation\n"
    "When the user explicitly says to go to a page, call navigate immediately — no confirmation needed.\n\n"
    "### Student-directory filter (only when current_page=student)\n"
    "When the user is on the student page and says 'filter / find ... grade ... college ... major ... class / active / suspended / graduated / withdrawn' or gives a student-id / name, call filter_students this turn with the parsed conditions.\n"
    "- Only fill fields the user explicitly mentioned; don't fill fields they didn't say (filling null clears that filter).\n"
    "- 'AI major' → major=人工智能 (keep Chinese for backend match); 'CS College' → college=计算机学院; 'class of 2024' → grade=2024级 (keep '级' suffix).\n"
    "- Status mapping: active→active, suspended→suspended, graduated→graduated, withdrawn→withdrawn.\n"
    "- Don't call query_students first to filter — this is a UI op; the tool just hands the conditions to the frontend.\n\n"
    "### Other\n"
    "For questions unrelated to system features, answer concisely in English.\n"
    "Do not invent features the system doesn't have. Available features: leave/return-from-leave, check-in, info collection, notification tasks, student info, knowledge Q&A."
)


def _pick(zh: str, en: str, lang: str) -> str:
    """Choose zh or en string based on lang flag (default zh fallback)."""
    return en if lang == "en" else zh


_ROLE_LABELS_ZH = {
    "student": "学生",
    "counselor": "辅导员",
    "college_admin": "院系管理员",
    "dean": "院系领导",
    "student_affairs_officer": "学工处人员",
    "school_admin": "校级管理员",
    "super_admin": "超级管理员",
    "employer": "用工单位主管",
}
_ROLE_LABELS_EN = {
    "student": "student",
    "counselor": "counselor",
    "college_admin": "college admin",
    "dean": "dean",
    "student_affairs_officer": "student-affairs officer",
    "school_admin": "school admin",
    "super_admin": "super admin",
    "employer": "employer supervisor",
}

_PAGE_LABELS_ZH = {
    "workspace": "工作台", "leave": "请销假", "collection": "信息收集",
    "checkin": "签到", "notification": "我的通知",
    "student": "学生信息", "knowledge": "知识问答",
}
_PAGE_LABELS_EN = {
    "workspace": "Workspace", "leave": "Leave", "collection": "Info Collection",
    "checkin": "Check-in", "notification": "Notifications",
    "student": "Students", "knowledge": "Knowledge",
}

# UI-side tools: the LLM emits one, chat.py emits action, frontend opens a modal.
# Query tools live in query_tools.TOOLS (role-filtered at request time).
UI_TOOLS = [
    {
        "name": "navigate",
        "description": (
            "导航到系统的指定功能页面。当用户明确说要去某页面时调用。"
            "leave=请销假应用(含请假列表 + 请假/销假/请假须知配置三 tab);"
            "leave-config=旧路径,自动重定向到 leave 页;"
            "notification=我的通知(站内收件箱,每个用户看自己收到的通知,P0 只读);"
            "notification-center=通知管理(管理员配通知规则,在系统管理下);"
            "其他业务页同名。"
            "tab/focus 可选:用户说「看 X 假别配置」时填 page=leave + tab=rule + focus={假别 code}, "
            "前端会切到请假规则 tab 并滚动到对应卡片高亮闪烁。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": [
                        "workspace", "leave", "leave-config", "collection",
                        "checkin", "notification", "notification-center",
                        "student", "knowledge",
                        "workflows", "work-study", "alerts",
                    ],
                    "description": "目标页面",
                },
                "tab": {
                    "type": "string",
                    "description": "(可选) 子 tab key,如 leave 页的 list/rule/return/notice",
                },
                "focus": {
                    "type": "string",
                    "description": (
                        "(可选) 假别 code 用于滚动 + 高亮命中卡。仅在 page=leave + tab=rule 时有意义。"
                        "事假=personal,病假=sick,婚假=marriage,公假=official_business,"
                        "因公外出=official,本科生外出实习=internship,晚归申请=late_return"
                    ),
                },
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
                "end_date": {
                    "type": "string",
                    "description": (
                        "结束日期 YYYY-MM-DD。请假时长（向上取整到天）不得超过 30 天，"
                        "用户口述更长时按 30 天封顶并在 reply 里告知用户'单次最多 30 天，已按上限填写'，"
                        "提醒其拆分多次申请。"
                    ),
                },
                "destination": {
                    "type": "string",
                    "description": (
                        "目的地（地级市，仅一个）。"
                        "用户口述「我去南京」「去北京老家」这类提到地名时填，"
                        "标准化为地级市，例如：南京市 / 北京市 / 上海市 / 苏州市。"
                        "不要包含区县或详细地址；填了无法匹配的地名前端会保留为文本。"
                        "用户没明确提地名时不要瞎猜，留空即可。"
                    ),
                },
                "reason_category": {
                    "type": "string",
                    "enum": ["家庭事务", "个人事务", "其他"],
                    "description": (
                        "事由分类——仅在 leave_type=personal（事假）时填写，其它假别留空。"
                        "依据用户自然语言里的 reason 判断："
                        "家里有事 / 老人住院 / 孩子生病 / 亲人来访 / 探亲 / 婚丧嫁娶 → 家庭事务；"
                        "看医生 / 办证件 / 搬家 / 参加培训 / 面试 / 处理私人事务 → 个人事务；"
                        "无法明确归类或介于两者之间 → 其他。"
                        "判断不出来时填'其他'，不要漏填——这是事假表单的必选项。"
                    ),
                },
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
        "name": "open_violation_form",
        "description": "打开登记违纪的表单，可预填信息。当用户说要登记违纪、录违纪、记录违纪行为时调用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "student_id": {"type": "string", "description": "学生 ID"},
                "student_name": {"type": "string", "description": "学生姓名"},
                "category": {
                    "type": "string",
                    "enum": ["exam", "academic", "dorm", "fight", "cyber", "other"],
                    "description": "类别: exam=考试违纪, academic=学术不端, dorm=宿舍违规, fight=打架斗殴, cyber=网络违规, other=其他",
                },
                "description": {"type": "string", "description": "违纪行为描述"},
            },
        },
        "allowed_roles": {"counselor", "dean", "school_admin"},
    },
    {
        "name": "filter_students",
        "description": (
            "在 学生信息库 页面按用户给的条件筛选学生列表。"
            "当用户在 current_page=student 的语境下明确说"
            "「过滤/筛选/找/查 …级 / …学院 / …专业 / …班 / …书院 / …楼栋 / 在读/休学/毕业/退学 / 学号/姓名」时调用。"
            "也包括「X 书院有哪些专业/学生/班级」这种由 UI 列表答的问题:填 academy 让列表收敛后用户肉眼看。"
            "只填用户明确给出的字段,未提到的字段不要填(这些字段会原样替换页面当前过滤值)。"
            "本工具不查询任何数据,只是把过滤条件交给前端。"
        ),
        # input_schema 在 _build_tools 里按字段目录 (field-catalog/student.yaml) 动态注入。
        # 占位空 schema 让模块加载时 tool 仍是合法形状,catalog 拉取失败时也能 fallback 到空 props。
        "input_schema": {"type": "object", "properties": {}},
        "allowed_roles": {"counselor", "dean", "school_admin", "student_affairs_officer"},
    },
    {
        "name": "open_appeal_form",
        "description": "打开违纪申诉表单。当学生说要对某条违纪申诉、不服违纪处分时调用，必须传入违纪记录 ID。",
        "input_schema": {
            "type": "object",
            "properties": {
                "violation_record_id": {"type": "string", "description": "违纪记录 ID，必填"},
                "reason": {"type": "string", "description": "申诉理由（可选预填）"},
            },
            "required": ["violation_record_id"],
        },
        "allowed_roles": {"student"},
    },
    {
        "name": "propose_workflow_config_change",
        "description": (
            "**校管理员对请假/销假规则的所有改动入口**。识别这些表述并直接调用本工具,"
            "不要先 navigate 再让用户重复说一次:\n"
            "- 改字段:「事假改成最多 5 天」「病假必须有证明」「审批超时改成 24 小时」\n"
            "- 改审批人:「审批多加一档辅导员」「事假最后一档改学校管理员」\n"
            "- 新增假别:「新增一个公假」「加个学术活动假」「再增加一个丧假」\n"
            "- 删除假别:「停用晚归申请」「砍掉婚假」\n"
            "- 学院差异化:「为艺术学院加一份特殊事假规则」「医学院实习要书记审批」\n"
            "- 销假调整:「销假改成 24 小时超时」「销假加个健康声明字段」\n"
            "**重要规则**:\n"
            "1. 即使老师没说「修改 / 新增」等明确动词,只要意图是配置变更,直接调本工具。\n"
            "2. **只要指令里含具体目标**(假别名:事假/病假/婚假/公假/...,或字段名:审批超时/上限/证明,或某学院名),**立即 emit 本工具,不要先反问**——instruction 透传原话,后端 LLM 信息不足会自己反问,前端展示给老师再补充。\n"
            "3. 仅当老师**完全不指定目标**(如纯说「改请假规则」「改流程」)时,才在 chat 直接反问。\n"
            "4. 本工具会自动导航到「请销假配置」页面 + 弹出 diff 预览卡,**不要再 emit navigate**。\n"
            "5. instruction 参数透传老师原话,不要改写或精简。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "biz_type": {
                    "type": "string",
                    "enum": ["leave", "leave_return"],
                    "description": "leave=请假,leave_return=销假",
                },
                "college_id": {
                    "type": "integer",
                    "description": "学院 override 的 college_id（org_unit.id of type=college）。老师没明确说「为某某学院」时不要填，留空走全校默认。",
                },
                "instruction": {
                    "type": "string",
                    "description": "老师说的原始指令(不要改写,完整透传给后端 LLM)",
                },
            },
            "required": ["biz_type", "instruction"],
        },
        "allowed_roles": {"school_admin", "super_admin", "student_affairs_director"},
    },
    {
        "name": "propose_notification_config_change",
        "description": (
            "**校管理员对通知中心规则的所有改动入口**。识别这些表述并直接调用本工具:\n"
            "- 启停:「关掉请假驳回通知」「停用 XX 通知」「重新启用 XX」\n"
            "- 改渠道:「学生超时改成只发企微」「XX 通知不要走小程序」\n"
            "- 改级别:「请假驳回改成紧急」\n"
            "- 改文案:「改 XX 通知的标题/正文」\n"
            "- 角色级覆盖:「辅导员收到的 XX 通知不要走小程序」「学生不要收 XX」\n"
            "**重要规则**:\n"
            "1. instruction 参数透传老师原话,不要改写。\n"
            "2. 即使用户没说「修改」等动词,只要意图是改通知配置,直接调本工具。\n"
            "3. 本工具会自动导航到「通知中心」+ 弹出 diff 预览卡,**不要再 emit navigate**。\n"
            "4. 仅当老师**完全不指定具体通知**(纯说「改通知」)时,才在 chat 反问。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "instruction": {
                    "type": "string",
                    "description": "老师原话,完整透传给后端 LLM",
                },
            },
            "required": ["instruction"],
        },
        "allowed_roles": {"school_admin", "super_admin", "student_affairs_director"},
    },
]


def _build_filter_students_schema(catalog: dict | None) -> dict:
    """把后端 field-catalog/student 转成 filter_students 的 JSON Schema。
    catalog 拉不到时返回空 properties — LLM 看到 0 字段就不会乱调。"""
    if not catalog or not catalog.get("fields"):
        return {"type": "object", "properties": {}}
    properties: dict[str, dict] = {}
    for f in catalog["fields"]:
        key = f.get("key")
        if not key:
            continue
        prop: dict = {"type": "string"}
        # 描述优先级:yaml description > label > key
        prop["description"] = f.get("description") or f.get("label") or key
        opts = f.get("options")
        if opts:
            values = [o.get("value") for o in opts if o.get("value") is not None]
            if values:
                prop["enum"] = values
        properties[key] = prop
    return {"type": "object", "properties": properties}


def _format_catalog_aliases(catalog: dict | None) -> str:
    """
    把 catalog 里有 aliases 的字段渲染成 system prompt 里的一段:
        - 性别：「男生」→ gender=male；「女生」→ gender=female

    没 aliases 的字段不出现 (它们的值是用户原话直接当 value,LLM 不需要别名表)。
    """
    if not catalog or not catalog.get("fields"):
        return ""
    lines: list[str] = []
    for f in catalog["fields"]:
        aliases = f.get("aliases") or []
        if not aliases:
            continue
        bits = [f"「{a['phrase']}」→ {f['key']}={a['value']}" for a in aliases]
        lines.append(f"- {f.get('label', f['key'])}：" + "；".join(bits))
    return "\n".join(lines)


async def _build_tools(role: str) -> list[dict]:
    """Merge UI tools (role-filtered) with query tools (role-filtered per
    registry). Two enums are patched at request time so backend changes don't
    require a sidecar redeploy:
      - open_leave_form.leave_type:从 LeaveTypeConfig 表拉
      - filter_students.input_schema:从 field-catalog/student.yaml 拉
    """
    import copy

    leave_types = await query_tools.fetch_leave_types()
    leave_type_codes = [t["code"] for t in leave_types]
    leave_type_desc = "假别 code，从下列可用值中选择：" + ", ".join(
        f"{t['code']}={t['name']}" for t in leave_types
    )

    student_catalog = await query_tools.fetch_field_catalog("student")
    filter_students_schema = _build_filter_students_schema(student_catalog)

    # Role header arrives comma-separated for multi-role users (see
    # _split_roles in query_tools); UI tool gating uses the same any-match rule.
    user_roles = {r.strip() for r in (role or "").split(",") if r.strip()}
    ui: list[dict] = []
    for t in UI_TOOLS:
        if t["allowed_roles"] is not None and not (user_roles & t["allowed_roles"]):
            continue
        cleaned = {k: v for k, v in t.items() if k != "allowed_roles"}
        if cleaned.get("name") == "open_leave_form":
            cleaned = copy.deepcopy(cleaned)
            props = cleaned.get("input_schema", {}).get("properties", {})
            lt = props.get("leave_type")
            if isinstance(lt, dict):
                lt["enum"] = leave_type_codes
                lt["description"] = leave_type_desc
        elif cleaned.get("name") == "filter_students":
            cleaned = copy.deepcopy(cleaned)
            cleaned["input_schema"] = filter_students_schema
        ui.append(cleaned)

    return ui + query_tools.tools_for_role(role)


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    history: list[dict] | None = None
    current_page: str | None = None
    current_modal: str | None = None
    user_role: str | None = None
    user_name: str | None = None
    # Locale for tool output ('zh' or 'en'); falls back to X-User-Lang header.
    user_lang: str | None = None
    # Objects the user pinned from the right panel. Each: {type, id, label, detail?}.
    refs: list[dict] | None = None


class ActionPayload(BaseModel):
    type: str
    data: dict | None = None


class Citation(BaseModel):
    doc_id: str
    title: str


class Highlight(BaseModel):
    type: str
    id: str


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    action: ActionPayload | None = None
    citations: list[Citation] | None = None
    # Entities the frontend should visually highlight (e.g. pulse the matching row).
    highlights: list[Highlight] | None = None


@router.post("/chat")
async def global_chat(
    req: ChatRequest,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default=""),
    x_user_lang: str = Header(default="zh"),
) -> ChatResponse:
    conv_id = req.conversation_id or uuid.uuid4().hex
    lang = (req.user_lang or x_user_lang or "zh").lower()
    if lang not in ("zh", "en"):
        lang = "zh"

    # Short-circuit:看 X 假别配置 → 直接 navigate,不进 LLM/RAG。
    # RAG 命中"请假管理办法"等知识库时 LLM 会忍不住答规章,跳转就失败 — 用规则强制路由。
    if (req.user_role in _LEAVE_RULE_VIEWER_ROLES):
        m = VIEW_LEAVE_RULE_RE.search(req.message or "")
        if m:
            name = m.group("name")
            code = LEAVE_TYPE_CN_TO_CODE.get(name)
            if code:
                return ChatResponse(
                    reply=f"好的,已为你定位到「{name}」配置卡。",
                    conversation_id=conv_id,
                    action=ActionPayload(
                        type="navigate",
                        data={"page": "leave", "tab": "rule", "focus": code},
                    ),
                )

    base = _pick(_SYSTEM_PROMPT_ZH, _SYSTEM_PROMPT_EN, lang)
    system_prompt = base.format(today=date.today().isoformat())

    role_labels = _pick(_ROLE_LABELS_ZH, _ROLE_LABELS_EN, lang)
    fallback_role = _pick("用户", "user", lang)
    role_label = role_labels.get(req.user_role or "student", fallback_role)
    user_display = (
        _pick(f"{req.user_name}（{role_label}）", f"{req.user_name} ({role_label})", lang)
        if req.user_name else role_label
    )
    system_prompt += _pick(
        f"\n\n## 当前用户\n你正在与{user_display}对话。请根据其角色提供对应的服务。\n",
        f"\n\n## Current user\nYou are speaking with {user_display}. Tailor your help to this role.\n",
        lang,
    )
    if req.user_role == "student":
        system_prompt += _pick(
            "- 学生用户：请假是为自己请假，可以查询自己的请假记录、通知等。\n"
            "- 不要提供管理功能（审批、统计、签到管理等）。\n",
            "- Student: leave requests are for themselves; they can query their own leave records, notifications, etc.\n"
            "- Do not offer management features (approvals, statistics, check-in admin, etc.).\n",
            lang,
        )
    elif req.user_role == "employer":
        system_prompt += _pick(
            "- 用工单位主管：仅服务于勤工助学相关场景——岗位发布、岗位申请审批、薪酬流程。\n"
            "- 不要提供请销假、签到、信息收集、通知、学生信息库等任何与用工单位无关的功能。\n"
            "- 用户问到非本职业务时，礼貌说明只能协助勤工助学相关问题。\n",
            "- Employer supervisor: only assist with work-study scenarios — position posting, application review, salary flow.\n"
            "- Do not offer leave, check-in, info collection, notifications, student directory or anything unrelated to work-study.\n"
            "- If the user asks about non-work-study tasks, politely explain you can only help with work-study.\n",
            lang,
        )
    elif req.user_role in ("counselor", "dean", "college_admin", "student_affairs_officer", "school_admin", "super_admin"):
        system_prompt += _pick(
            "- 教师/管理员用户：请假相关操作是代学生请假。需要先问清楚为哪位同学请假。\n"
            "- 可以使用所有管理功能：审批、签到、信息收集、通知等。\n",
            "- Staff/admin: leave operations are filed on behalf of a student — first ask which student.\n"
            "- All management features are available: approvals, check-in, info collection, notifications, etc.\n",
            lang,
        )

    page_labels = _pick(_PAGE_LABELS_ZH, _PAGE_LABELS_EN, lang)
    if req.current_page:
        page_label = page_labels.get(req.current_page, req.current_page)
        if lang == "en":
            system_prompt += f"\n## Current page\nThe user is on the «{page_label}» page"
            if req.current_modal:
                system_prompt += f", with modal open: {req.current_modal}"
            system_prompt += (
                ".\n- If the user's intended action matches this page's feature, call the matching open_*_form tool directly — no navigate.\n"
                "- If the user clearly switches topic, follow the normal flow.\n"
            )
        else:
            system_prompt += f"\n## 当前页面\n用户正在「{page_label}」页面"
            if req.current_modal:
                system_prompt += f"，打开的弹窗：{req.current_modal}"
            system_prompt += "。\n- 若用户要执行的操作正是当前页面的功能，直接调用对应表单工具（如 open_*_form），不用再 navigate。\n- 若用户明显在换话题，按正常流程处理。\n"

        # Catalog-driven field aliases:学生页加一段从 yaml 自动生成的别名映射,
        # 让"加新字段 (含 aliases) → LLM 自动学会自然语言映射"成立。
        if req.current_page == "student":
            student_catalog = await query_tools.fetch_field_catalog("student")
            alias_block = _format_catalog_aliases(student_catalog)
            if alias_block:
                system_prompt += _pick(
                    f"\n## 字段别名 (来自 field-catalog/student)\n{alias_block}\n",
                    f"\n## Field aliases (from field-catalog/student)\n{alias_block}\n",
                    lang,
                )

    # Pinned refs — objects the user explicitly marked as the target of this turn.
    # When the user says 「这个学生 / 这条洞察 / 那条请假」, treat those as references
    # to the items listed here (in the order pinned).
    if req.refs:
        system_prompt += _pick(
            "\n## 用户指代的对象（来自右侧面板）\n",
            "\n## Objects the user is referring to (from the right panel)\n",
            lang,
        )
        for i, r in enumerate(req.refs, start=1):
            rtype = str(r.get("type", "object"))
            label = str(r.get("label", ""))
            rid = str(r.get("id", ""))
            detail = str(r.get("detail", "")).strip()
            line = f"{i}. [{rtype}] {label}"
            if rid:
                line += _pick(f"(id={rid})", f"(id={rid})", lang)
            if detail:
                line += f" — {detail}"
            system_prompt += line + "\n"
        system_prompt += _pick(
            "- 用户消息中的「这个/这条/他/她/该学生/此处」默认指上述对象。\n"
            "- **指代消歧优先级**：用户若限定了修饰词（「高风险」「中风险」「这条」等），"
            "请在上述对象列表中只挑 label 包含该关键词的子集；不要把未命中修饰词的对象混进来。"
            "例如用户问「此处高风险人员」，仅考虑 label 含「高风险」的 student 对象。\n"
            "- 当用户问「这些学生/他们最近表现怎么样」「有没有缺课」「有什么异常」"
            "且上述对象里有 student 类型时，**本轮直接调用 query_student_events**，"
            "把命中修饰词的 student 对象的 {id, name} 作为 students 参数传入，不要先问是否查询。\n"
            "- **请假查询路由**：当用户问某位学生「请假情况/请假记录/近 N 个月请假」"
            "且 refs 有 student 对象时，**必须用 query_leaves(scope=student, student_id=..., months=...)** "
            "而不是 scope=class 再人工挑。多个学生时分别调用。\n"
            "- 如果用户针对某条对象问操作类动作（如「约谈这个学生」「跟进这条诉求」），"
            "你应当按该对象的 type 决定合适的应答：student 对象优先考虑打开学生档案或记录一次谈话建议；"
            "insight 对象优先拆解建议条目的下一步；leave 对象可提示审批细节。\n"
            "- 涉及真实查询时，仍然必须先调 query_* 工具，不要凭对象上的 label 编造数据。\n",
            "- Pronouns in the user's message (this / that / he / she / this student / here) default to the objects above.\n"
            "- **Disambiguation priority**: if the user adds a qualifier ('high risk', 'medium risk', 'this one' etc.), pick only the subset of objects whose label contains that keyword — do not mix in non-matching objects. "
            "E.g. when the user asks 'high-risk people here', consider only student objects whose label contains 'high-risk'.\n"
            "- When the user asks 'how are these students recently?' / 'any absences?' / 'any anomalies?' and there are student objects above, **call query_student_events directly this turn**, "
            "passing those students' {id, name} as the `students` argument — do not first ask whether to query.\n"
            "- **Leave-query routing**: when the user asks 'this student's leave situation / leave records / leave in the last N months' and a student object is in refs, "
            "**you MUST use query_leaves(scope=student, student_id=..., months=...)** instead of scope=class. Call once per student if there are multiple.\n"
            "- For action-style requests on a specific object ('have a chat with this student', 'follow up on this complaint'), choose your reply by the object's type: student → suggest opening the profile or logging a chat note; insight → break down the next step; leave → mention approval details.\n"
            "- For real data lookups you still must call a query_* tool first — never fabricate from an object's label.\n",
            lang,
        )

    rag_articles = await retrieve_semantic(req.message)
    if rag_articles:
        system_prompt += format_context(rag_articles)

    tools = await _build_tools(req.user_role or "student")

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
                # 防 LLM 跳步：open_leave_form 必须在用户**当前轮**回复确认词
                # 时才能触发；否则视为"确认+提交同轮"误用，拦截并把 LLM 文本
                # 当作确认摘要返回，让用户在下一轮显式确认。仅对 leave 强制，
                # 其它表单（签到、收集）暂不施加同款门控。
                if ui_tool.name == "open_leave_form" and not _is_confirmation_msg(req.message):
                    logger.info(
                        "open_leave_form gated: user msg=%r is not a confirmation; "
                        "stripping tool call and returning summary text only",
                        req.message[:80],
                    )
                    action = None
                    summary = (turn.text or "").strip()
                    if not summary:
                        # LLM 没给文本就直接 emit 工具——给个兜底确认提示
                        summary = '已收集请假信息。请回复「是」或「提交」以确认，或继续告诉我需要修改的字段。'
                    elif not summary.endswith(("?", "？")):
                        summary += "（请回复「是」或「提交」以确认）"
                    reply = summary
                else:
                    # For open_leave_form, attach the user's last actual
                    # request as _raw_input so the frontend can persist it
                    # alongside the AI prediction snapshot for later analysis.
                    payload = dict(ui_tool.input)
                    if ui_tool.name == "open_leave_form":
                        # Walk back from the confirmation turn to find the
                        # user's most recent non-confirmation message — that's
                        # the actual leave request text the AI parsed.
                        last_meaningful = None
                        if req.history:
                            for h in reversed(req.history):
                                if h.get("role") == "user":
                                    content = (h.get("content") or "").strip()
                                    if content and not _is_confirmation_msg(content):
                                        last_meaningful = content
                                        break
                        payload["_raw_input"] = last_meaningful or req.message
                    action = ActionPayload(type=ui_tool.name, data=payload)
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
                    user_lang=lang,
                )
                convo.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": output,
                })
        else:
            # Loop exited by exhausting MAX_ITERS without a text answer.
            if not reply:
                reply = _pick(
                    "查询过程过长，已中止。请换一种提问方式。",
                    "The query took too long and was aborted. Please rephrase.",
                    lang,
                )

        if not (reply or "").strip() and action:
            reply = _action_reply(action, lang)

        # Citations only make sense when this turn was a knowledge-style answer.
        # Suppress them when the turn produced an action (filter_students /
        # open_*_form / navigate) or ran a query tool — the user isn't asking
        # for reference material, just executing.
        citations: list[Citation] | None = None
        if rag_articles and not tool_ran and action is None:
            seen: set[str] = set()
            citations = []
            for a in rag_articles:
                if a.doc_id in seen:
                    continue
                seen.add(a.doc_id)
                citations.append(Citation(doc_id=a.doc_id, title=a.doc_title))
            citations = citations or None

        # Echo pinned refs as highlights when this turn produced a text reply
        # (i.e., the AI actually spoke about them rather than just opening a form).
        # This lets the right panel visually pulse the rows the user is discussing.
        highlights: list[Highlight] | None = None
        if req.refs and reply and action is None:
            hl: list[Highlight] = []
            for r in req.refs:
                rtype = str(r.get("type", "")).strip()
                rid = str(r.get("id", "")).strip()
                if rtype and rid:
                    hl.append(Highlight(type=rtype, id=rid))
            highlights = hl or None

        return ChatResponse(
            reply=reply, conversation_id=conv_id,
            action=action, citations=citations, highlights=highlights,
        )
    except Exception:
        logger.exception("LLM call failed")
        return ChatResponse(
            reply=_pick(
                "AI 服务暂时不可用，请稍后重试。",
                "The AI service is temporarily unavailable. Please retry shortly.",
                lang,
            ),
            conversation_id=conv_id,
        )


def _action_reply(action: ActionPayload, lang: str = "zh") -> str:
    """Generate a user-friendly reply for an action."""
    t = action.type
    d = action.data or {}
    if t == "navigate":
        labels = _pick(_PAGE_LABELS_ZH, _PAGE_LABELS_EN, lang)
        page = d.get("page", "")
        page_label = labels.get(page, page)
        return _pick(
            f"好的，已为您跳转到「{page_label}」页面。",
            f"OK, navigating you to the «{page_label}» page.",
            lang,
        )
    elif t == "open_leave_form":
        if lang == "en":
            tail = f", reason pre-filled: {d['reason']}" if d.get("reason") else ""
            return f"OK, leave-request form opened{tail}."
        tail = f"，已预填事由：{d['reason']}" if d.get("reason") else ""
        return f"好的，已为您打开请假申请表单{tail}。"
    elif t == "open_checkin_form":
        return _pick(
            "好的，已为您打开创建签到活动表单。",
            "OK, the create-check-in form is open.",
            lang,
        )
    elif t == "open_collection_form":
        return _pick(
            "好的，已为您打开创建信息收集单表单。",
            "OK, the create-collection form is open.",
            lang,
        )
    elif t == "open_violation_form":
        if lang == "en":
            tail = f", student: {d['student_name']}" if d.get("student_name") else ""
            return f"OK, violation-record form opened{tail}."
        tail = f"，学生：{d['student_name']}" if d.get("student_name") else ""
        return f"好的，已为您打开登记违纪表单{tail}。"
    elif t == "open_appeal_form":
        if lang == "en":
            tail = f", violation-record id: {d['violation_record_id']}" if d.get("violation_record_id") else ""
            return f"OK, appeal form opened{tail}."
        tail = f"，违纪记录 ID：{d['violation_record_id']}" if d.get("violation_record_id") else ""
        return f"好的，已为您打开违纪申诉表单{tail}。"
    elif t == "filter_students":
        bits: list[str] = []
        if d.get("grade"): bits.append(d["grade"])
        if d.get("college"): bits.append(d["college"])
        if d.get("major"):
            bits.append(_pick(f"{d['major']}专业", f"{d['major']} major", lang))
        if d.get("class_name"): bits.append(d["class_name"])
        if d.get("gender"):
            bits.append(_pick({"male": "男生", "female": "女生"}, {"male": "male", "female": "female"}, lang).get(d["gender"], d["gender"]))
        if d.get("academy"): bits.append(d["academy"])
        if d.get("dorm_block"): bits.append(d["dorm_block"])
        status_label = _pick(
            {"active": "在读", "suspended": "休学", "graduated": "毕业", "withdrawn": "退学"},
            {"active": "active", "suspended": "suspended", "graduated": "graduated", "withdrawn": "withdrawn"},
            lang,
        ).get(d.get("status") or "")
        if status_label: bits.append(status_label)
        if d.get("keyword"):
            bits.append(_pick(f"关键字「{d['keyword']}」", f"keyword «{d['keyword']}»", lang))
        if lang == "en":
            body = ", ".join(bits) if bits else "(filters cleared)"
            return f"Filtered: {body}."
        body = "、".join(bits) if bits else "（清空过滤）"
        return f"已为您过滤：{body}。"
    return _pick("操作已执行。", "Action executed.", lang)
