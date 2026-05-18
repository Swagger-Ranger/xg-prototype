"""Workspace insight endpoint.

Accepts role-scoped metrics JSON from the Java backend, runs a bounded
tool-use agent (max 3 query_* tool calls in 1 round of drilldown) so the
LLM can fetch specific students/alerts before synthesizing insights.

On any failure (LLM down, bad JSON, empty) the endpoint returns an empty
insights array with an error_message — never raises. This lets the caller
(Java InsightService) always persist a row and downstream UI degrade
gracefully to "暂无 AI 洞察".
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.llm.deepseek import DeepSeekProvider
from app.tool import query_tools

router = APIRouter(tags=["insight"])
logger = logging.getLogger(__name__)

llm = DeepSeekProvider()

MAX_TOOL_CALLS = 3
MAX_ITERS = 3

Severity = Literal["info", "warn", "critical"]

_LANG_GUARD = (
    "## 用户可见文本必须是中文（硬约束）\n"
    "title / detail / suggestion / category / label / evidence 等**会显示给用户**的字段，"
    "**禁止**出现 critical / high / medium / low / warn / info 等英文枚举单词。\n"
    "如需描述严重程度，用中文：critical→「紧急」/ high→「高」/ medium→「中」/ low→「低」/"
    " warn→「关注」/ info→「提示」。\n"
    "**例外**：JSON 中 `severity` 字段的取值（"
    "info/warn/critical 三选一）必须保持英文 enum；"
    "`refs[].type` 的取值（metric/student/alert/...）也保持英文 enum。"
    "其它一律不许出现英文严重度词。\n"
    "范例：✗「含1条critical级预警」 ✓「含1条紧急预警」"
)

SYSTEM_PROMPTS = {
    "counselor": (
        "你是高校辅导员的 AI 助手，负责基于班级学生的量化指标给出**可执行**的工作洞察。\n"
        "你面向的是一线辅导员，他们关心：待审批工单堆积、异常学生、近期违纪/迟到/请假高峰、通知催办与信息收集进度。\n"
        "风格：简洁、专业、带具体数字、每条给出一条可立即执行的下一步建议。\n"
        + _LANG_GUARD + "\n"
        "原则：\n"
        "- 只基于给定的 metrics JSON 和工具返回的真实结果推理，不要编造数据。\n"
        "- 如果某项指标为 0 或缺失，不要硬凑洞察。\n"
        "- severity 分级：\n"
        "  · info=常规提示 / **低风险可批量处理**（如：全是事假 1 天、无违纪关联、无迟到记录）；\n"
        "  · warn=需要这周内关注（请假有堆积或与缺勤共现）；\n"
        "  · critical=需要立刻处理（严重迟到/缺席高发、违纪、critical 级预警）。\n"
        "- 最多产出 5 条，少于 3 条也 OK，宁缺毋滥。\n\n"
        "## 主动下钻（针对当月考勤与请假）\n"
        "当 metrics.leave_pending 或 metrics.checkin_late_last_7d 不为 0 时，**本轮务必**调用 "
        "query_leaves(scope=class, status=pending) 和/或 query_stats(metric=leaves, date_range=this_month) "
        "拿到最近一个月真实的请假清单与状态分布，再综合判断分级。只看 metrics 汇总数会漏掉\"哪几条其实很安全\"。\n"
        "## 通知任务进度（必须输出）\n"
        "当 metrics.notifications_in_progress 数组非空时，产出 1 条 category=\"通知催办\" 的 insight：\n"
        "- detail：≤80 字，写清楚有几条通知未读率偏高，点名 1-2 条最严重的标题与 confirmed_recipients/total_recipients 比例。\n"
        "- refs：为数组里 (total_recipients - confirmed_recipients) 最高的前 3 条各生成一个 "
        "{type:\"notification\", id:\"<真实 id>\", label:\"<标题·X/Y>\"}。id 严禁编造。\n"
        "- action：填 null（前端会在 ref 上渲染跳转按钮）。\n"
        "## 信息收集任务进度（必须输出）\n"
        "当 metrics.collections_in_progress 数组非空时，产出 1 条 category=\"信息收集\" 的 insight：\n"
        "- detail：≤80 字，概述几个表单填报率低、是否有临近 deadline 的。\n"
        "- refs：为 (expected - submitted) 最大或 deadline 最近的前 3 张表单各生成一个 "
        "{type:\"form\", id:\"<真实 id>\", label:\"<标题·submitted/expected>\"}。id 严禁编造。\n"
        "- action：填 null（前端会在每条 ref 上渲染「催办」按钮）。\n"
        "## 主动关怀（关键，必须输出）\n"
        "当 metrics.recent_alerts 数组非空时，**必须**产出至少 1 条 category=\"主动关怀\" 的 insight"
        "（recent_alerts 现在是待处理的主动关怀任务，非旧版预警）：\n"
        "- severity：若数组中存在 severity=critical 的任务，整条 insight severity=critical；"
        "否则有 high/warn → warn；全部 info → info。\n"
        "- detail：≤80 字概括关怀任务数量、最需优先处置的几位学生的姓名和触发规则；不要罗列全部。\n"
        "- refs：**必须**为 recent_alerts 中的每一条生成一个 ref，{type:\"alert\", id:\"<数组里的真实 id>\", "
        "label:\"<学生名·规则名>\"}。id 必须原样引用 metrics.recent_alerts[i].id，不得编造。\n"
        "- 再加一条 {type:\"metric\", id:\"recent_alerts\", label:\"待处理关怀\"} 便于核验。\n"
        "- action：填 null（关怀的一键操作由前端按 ref 自动生成：受理/误报/发起谈话）。\n"
        "## 数字与学生的区分（必须遵守，避免幻觉）\n"
        "- metrics.checkin_late_last_7d 是**迟到事件总次数**，不是迟到学生人数。\n"
        "  一位学生可能贡献多次迟到。**严禁**据此直接说\"有 N 名学生迟到\"。\n"
        "- 如果 insight 里要点名迟到人数或具体学生，**必须**先调用 "
        "query_late_students(days=7, limit=10) 拿真实 student_id 和姓名，再写 detail。\n"
        "- 此工具返回的每位学生带 id，把它们放到 refs 里 type=student，id=真实数字；"
        "不调工具就不要写人数/人名。\n"
        "## 低风险批量建议\n"
        "如果工具返回显示 pending 列表里多数是事假 ≤1 天、无违纪关联、无迟到记录，"
        "**必须**单独产出 1 条 info 级洞察，category=\"批量审阅\"，并在 action 字段填写：\n"
        "  action = {\"type\": \"pin_and_review\", \"label\": \"一键审阅这些低风险请假\", "
        "\"payload\": {\"refs\": [{\"type\": \"leave\", \"id\": \"<leave_id>\", \"label\": \"<学生名·天数\"}...], \"page\": \"leave\"}}\n"
        "这会把这些 leave 固定到 AI 上下文，并跳转到请假页让辅导员逐条/批量处理。"
    ),
    "dean": (
        "你是高校院系领导的 AI 助手，负责基于全院学生工作指标给出**统筹层面**的洞察。\n"
        "你面向的是院领导/学工部负责人，他们关心：全院 KPI、班级/辅导员工作负载分布、趋势环比、舆情热点。\n"
        "风格：数据驱动、突出结构性问题、给出战略建议而非微操。\n"
        + _LANG_GUARD + "\n"
        "原则：\n"
        "- 只基于给定的 metrics JSON 推理，不要编造数据。\n"
        "- 优先指出**异常分布**和**环比变化**，而非绝对数量。\n"
        "- severity 分级：info=常规汇报；warn=存在结构性隐患；critical=需要立即启动专项。\n"
        "- 最多产出 5 条，少于 3 条也 OK。\n"
        "## 主动关怀（当 metrics.recent_alerts 非空时必须输出）\n"
        "- 产出 1 条 category=\"主动关怀\" 的洞察，整院视角聚焦于分布（严重关怀任务人数、涉及辅导员/班级）。\n"
        "- refs：为 recent_alerts 里最严重的前 3 条生成 {type:\"alert\", id:\"<真实 id>\", label:\"<学生名·规则名>\"}，"
        "id 严禁编造。\n"
        "## 通知/信息收集进度\n"
        "- 若 metrics.notifications_in_progress 或 metrics.collections_in_progress 非空，可产出 1-2 条院级进度洞察，"
        "refs 分别使用 {type:\"notification\", id:\"<id>\", label:...} 或 {type:\"form\", id:\"<id>\", label:...}，"
        "id 必须来自这两个数组。"
    ),
}

DRILLDOWN_GUIDANCE = (
    "\n\n## 工具下钻（可选，最多 3 次调用）\n"
    "你可以调用只读 query_* 工具来下钻看具体学生/请假/违纪/签到，"
    "让洞察引用真实 id 而不是只谈 metric key。\n"
    "- 每次至多调用 1 组工具（可并行），总共不超过 3 次调用。\n"
    "- 只在 metrics 里有明显异常（如 alerts_critical > 0、leave_pending > 5、某指标环比激增）时才调；"
    "metrics 本身就平稳就不要下钻，直接出结论。\n"
    "- 工具返回后，你必须总结并输出最终 JSON；不要再继续调用工具。\n"
    "- 如果工具返回具体学生/签到 ID，优先把它放进对应 insight 的 refs 里。\n"
    "- 涉及\"迟到的 N 名学生具体是谁\"时必须用 query_late_students，"
    "不允许用 metrics 里的迟到事件数自行猜测人数或人名。\n"
)

OUTPUT_CONTRACT = (
    "\n\n## 输出格式（严格遵守）\n"
    "只输出一个 JSON 对象，不要有任何其他文字、Markdown 标记或解释。\n"
    "结构：\n"
    "{\n"
    '  "insights": [\n'
    "    {\n"
    '      "severity": "info" | "warn" | "critical",\n'
    '      "category": "短标签，如：审批堆积 / 主动关怀 / 违纪 / 请假 / 通知催办 / 信息收集 / 签到 / 总览 / 批量审阅",\n'
    '      "title": "≤20 字的一句话概括",\n'
    '      "detail": "≤80 字的事实陈述，必须引用 metrics 里的具体数字",\n'
    '      "suggestion": "≤40 字的下一步动作建议",\n'
    '      "evidence": ["依据来源：xxx", ...],\n'
    '      "action": {"type": "pin_and_review" | "navigate", "label": "...", "payload": {...}} | null,\n'
    '      "refs": [\n'
    "        {\n"
    '          "type": "metric" | "student" | "alert" | "counselor",\n'
    '          "id": "字符串类型的 id / metrics 里的 key 路径，没有具体 id 时填 key",\n'
    '          "label": "≤12 字的人类可读标签，用于前端展示"\n'
    "        }\n"
    "      ]\n"
    "    }\n"
    "  ]\n"
    "}\n\n"
    "## evidence 字段（关键，用于打消辅导员对 AI 判断的疑虑）\n"
    "- 每条 insight 至少给 1 条 evidence，最多 3 条，每条 ≤40 字。\n"
    "- **用辅导员能看懂的自然中文**，不要出现 query_xxx()、metrics.xxx 这类技术词。\n"
    "- 但必须把三要素写清楚，让辅导员能自己回去核对：\n"
    "    ① **时间窗口**（如：本月 / 近 7 天 / 近 30 天）\n"
    "    ② **范围**（如：本班 / 全院 / 这位学生 / 待审）\n"
    "    ③ **具体数字**（件数、人次、百分比、天数）\n"
    "- 好的写法：\n"
    "  · \"本月本班待审请假 8 条，其中 7 条为 1 天内事假\"\n"
    "  · \"近 7 天班级迟到事件 2 次，低于上月同期\"\n"
    "  · \"本月班级请假共 18 条，8 条仍在审批中\"\n"
    "  · \"张三近 30 天缺勤 3 次、迟到 4 次\"\n"
    "- 不好的写法（禁止）：\n"
    "  · \"依据 query_leaves(class,pending)：8 条中 7 条为事假\"（不用工具名）\n"
    "  · \"metrics.checkin_late_last_7d=2\"（不用 key）\n"
    "  · \"数据显示风险较高\"（没有数字、没有范围）\n\n"
    "## action 字段\n"
    "- 没有合适的一键动作就填 null。\n"
    "- type=\"pin_and_review\"：payload={refs:[{type,id,label}...], page:\"leave\"}，"
    "用于低风险请假批量建议；前端会把这些对象固定到 AI 上下文再跳转。\n"
    "- type=\"navigate\"：payload={page:\"leave\"|...}，仅用于跳转。\n\n"
    "## refs 字段填写规则（关键，请严格遵守）\n"
    "1. 每条 insight 至少给 1 个 ref，最多 3 个。\n"
    "2. type=metric：引用 metrics JSON 里的 key 路径（如 `leave_pending`、`alerts_by_severity.critical`），id 填 key 路径，label 填中文。\n"
    "3. type=student：仅当 metrics 里明确出现了学生 id（如 top_students[].id）时才使用。\n"
    "4. type=alert：仅当 metrics 里明确出现告警 id 时才使用。\n"
    "5. type=counselor：引用 top_counselor_workload 里的辅导员时填 name 作为 label，id 可为空字符串。\n"
    "6. 严禁编造不存在的 id；不确定时用 metric 类型并指向 key 路径。\n"
)


class InsightRequest(BaseModel):
    role: Literal["counselor", "dean"]
    scope_key: str = "global"
    user_id: str = "0"
    user_role: str = ""
    tenant_id: str = "default"
    metrics: dict[str, Any] = Field(default_factory=dict)


class InsightRef(BaseModel):
    """Structured evidence pointer.

    The frontend uses `type` to decide the link target:
      metric       → no navigation (chip only)
      student      → /student?studentId=<id>&tab=timeline
      alert        → /alerts?id=<id>
      counselor    → no navigation (chip with name)
      notification → inline 催办 card (uses metrics.notifications_in_progress)
      form         → inline 催办 card (uses metrics.collections_in_progress)
    """
    type: Literal["metric", "student", "alert", "counselor", "notification", "form"] = "metric"
    id: str = ""
    label: str = ""


class InsightAction(BaseModel):
    """Suggested one-click action the counselor can take from the card.

    Type examples:
      - "navigate": payload={"page": "leave", "params": {"status": "pending"}}
      - "pin_and_review": payload={"refs": [{type,id,label}...], "page": "leave"}
        → pin those refs to AI context, then route to the target page.
    """
    type: str
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class InsightItem(BaseModel):
    severity: Severity = "info"
    category: str = ""
    title: str = ""
    detail: str = ""
    suggestion: str = ""
    # Short source-citation lines, each like "依据 query_leaves(class): 8 条事假 ≤1 天".
    # These sit under the detail to show the counselor *where* each number came from.
    evidence: list[str] = Field(default_factory=list)
    # Optional one-click action rendered as a button under the suggestion.
    action: InsightAction | None = None
    refs: list[InsightRef] = Field(default_factory=list)

    @field_validator("refs", mode="before")
    @classmethod
    def _normalize_refs(cls, v: Any) -> list[dict[str, str]]:
        """Tolerate the legacy `list[str]` format — coerce to metric refs.

        Some models occasionally still emit bare strings. We normalize to
        structured objects so downstream (Java persistence + frontend) doesn't
        choke, at the cost of a slightly degraded label.
        """
        if v is None:
            return []
        if not isinstance(v, list):
            return []
        out: list[Any] = []
        for item in v:
            if isinstance(item, str):
                out.append({"type": "metric", "id": item, "label": item})
            elif isinstance(item, dict) or isinstance(item, InsightRef):
                out.append(item)
        return out


class InsightResponse(BaseModel):
    model: str
    insights: list[InsightItem] = Field(default_factory=list)
    error_message: str | None = None


@router.post("/insights", response_model=InsightResponse)
async def generate_insights(req: InsightRequest) -> InsightResponse:
    system = SYSTEM_PROMPTS.get(req.role)
    if system is None:
        return InsightResponse(model=settings.deepseek_model, error_message=f"unknown role: {req.role}")

    # Role for backend tool calls. Defaults to the insight role ("counselor"/"dean"),
    # which both carry sufficient permissions for query_* tools.
    caller_role = req.user_role or req.role
    tools = query_tools.tools_for_role(caller_role)

    system += DRILLDOWN_GUIDANCE + OUTPUT_CONTRACT
    user = f"metrics JSON：\n```json\n{json.dumps(req.metrics, ensure_ascii=False)}\n```"

    convo: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    tool_call_count = 0
    final_text = ""
    try:
        for _iter in range(MAX_ITERS):
            # Drop tool access on the last iter to force synthesis.
            iter_tools = tools if tool_call_count < MAX_TOOL_CALLS and _iter < MAX_ITERS - 1 else None
            turn = await llm.chat_native(
                messages=convo,
                tools=iter_tools,
                temperature=0.3,
                max_tokens=1500,
            )

            if not turn.tool_calls:
                final_text = turn.text
                break

            remaining = MAX_TOOL_CALLS - tool_call_count
            if remaining <= 0:
                # Model tried tools after budget — nudge it to synthesize.
                convo.append({
                    "role": "user",
                    "content": "工具调用次数已用完，请基于以上 metrics 和已有工具结果直接输出最终 JSON。",
                })
                continue

            convo.append(turn.assistant_message)
            calls_this_round = turn.tool_calls[:remaining]
            for tc in calls_this_round:
                output = await query_tools.execute(
                    tc.name, tc.input,
                    user_id=req.user_id,
                    tenant_id=req.tenant_id,
                    user_role=caller_role,
                )
                convo.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": output,
                })
                tool_call_count += 1
            # If the model tried to call more than remaining, add a stub tool result
            # for each ignored call so the OpenAI tool-call invariant holds.
            for tc in turn.tool_calls[remaining:]:
                convo.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": "工具预算已耗尽，请基于已有信息完成综述。",
                })
            # After any tool round, nudge the model to output JSON next turn.
            convo.append({
                "role": "user",
                "content": "以上是工具返回。现在请严格按 OUTPUT_CONTRACT 输出一个 JSON 对象 "
                           "（包含 insights 数组），不要再调用任何工具，不要有其它文字。",
            })
        else:
            # Exhausted iterations without text — salvage last text if any.
            final_text = final_text or turn.text
    except Exception as e:
        logger.exception("insight agent failed")
        return InsightResponse(model=settings.deepseek_model, error_message=f"llm error: {e}")

    items, err = _parse_insights(final_text)
    items, dropped = _reflect(items, req.metrics)
    logger.info(
        "insight generated role=%s scope=%s tool_calls=%d items=%d dropped=%d err=%s",
        req.role, req.scope_key, tool_call_count, len(items), dropped, err,
    )
    return InsightResponse(
        model=settings.deepseek_model,
        insights=items,
        error_message=err,
    )


def _flatten_metric_keys(obj: Any, prefix: str = "") -> set[str]:
    """Collect every dotted key path inside a metrics dict, including intermediate keys.

    Example: {"a": {"b": 1, "c": 2}} → {"a", "a.b", "a.c"}
    """
    keys: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}{k}"
            keys.add(path)
            if isinstance(v, (dict, list)):
                keys |= _flatten_metric_keys(v, f"{path}.")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            path = f"{prefix}[{i}]"
            keys.add(path)
            if isinstance(v, (dict, list)):
                keys |= _flatten_metric_keys(v, f"{path}.")
    return keys


def _reflect(items: list[InsightItem], metrics: dict[str, Any]) -> tuple[list[InsightItem], int]:
    """Programmatic reflection — verify that every `type=metric` ref points to
    a real key inside `metrics`. Invalid metric refs are stripped. If after
    stripping an insight has zero refs left (but originally had some), it's
    dropped as likely fabricated.

    student/alert/counselor refs are trusted for now — verifying them would
    require a second backend round-trip per id.
    """
    if not items:
        return items, 0
    valid_keys = _flatten_metric_keys(metrics)
    known_alert_ids: set[str] = set()
    for row in metrics.get("recent_alerts") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            known_alert_ids.add(str(row["id"]))
    known_notification_ids: set[str] = set()
    for row in metrics.get("notifications_in_progress") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            known_notification_ids.add(str(row["id"]))
    known_form_ids: set[str] = set()
    for row in metrics.get("collections_in_progress") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            known_form_ids.add(str(row["id"]))
    kept: list[InsightItem] = []
    dropped = 0
    for it in items:
        had_refs = bool(it.refs)
        clean: list[InsightRef] = []
        for r in it.refs:
            if r.type == "metric":
                if r.id and r.id in valid_keys:
                    clean.append(r)
                else:
                    logger.info("reflection: drop fabricated metric ref %r on %r", r.id, it.title)
            elif r.type == "alert" and known_alert_ids:
                if r.id and r.id in known_alert_ids:
                    clean.append(r)
                else:
                    logger.info("reflection: drop fabricated alert ref %r on %r", r.id, it.title)
            elif r.type == "notification" and known_notification_ids:
                if r.id and r.id in known_notification_ids:
                    clean.append(r)
                else:
                    logger.info("reflection: drop fabricated notification ref %r on %r", r.id, it.title)
            elif r.type == "form" and known_form_ids:
                if r.id and r.id in known_form_ids:
                    clean.append(r)
                else:
                    logger.info("reflection: drop fabricated form ref %r on %r", r.id, it.title)
            else:
                clean.append(r)
        if had_refs and not clean:
            logger.warning("reflection: drop insight %r — all refs fabricated", it.title)
            dropped += 1
            continue
        it.refs = clean
        kept.append(it)
    return kept, dropped


def _parse_insights(raw: str) -> tuple[list[InsightItem], str | None]:
    """Extract `insights` array from LLM output, tolerating fenced blocks."""
    text = (raw or "").strip()
    if not text:
        return [], "empty llm output"

    # Strip common fencing: ```json ... ``` or ``` ... ```
    fenced = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        # Last-resort: grab the outermost JSON object
        obj_match = re.search(r"\{.*\}", text, re.DOTALL)
        if not obj_match:
            return [], "no json found"
        try:
            data = json.loads(obj_match.group(0))
        except json.JSONDecodeError as e:
            return [], f"json parse failed: {e}"

    if isinstance(data, list):
        items_raw = data
    elif isinstance(data, dict):
        items_raw = data.get("insights") or data.get("items") or []
    else:
        return [], "unexpected json shape"

    out: list[InsightItem] = []
    for it in items_raw[:5]:
        if not isinstance(it, dict):
            continue
        try:
            out.append(InsightItem(**it))
        except Exception as e:
            logger.warning("skip malformed insight item: %s (%s)", it, e)
    return out, None
