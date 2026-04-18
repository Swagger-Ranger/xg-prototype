"""Read-only query tools that call the Java backend and format the result
as a short Chinese summary string the LLM can quote in its reply.

Design notes:
- Each tool takes a structured arg dict (scope enum, IDs) — never free-text keywords.
- Each tool declares `allowed_roles` so chat.py can filter the registry per-user.
- Handlers return a plain-text summary (never raw JSON), trimmed to a small N.
- All handlers share `_request` for auth-header injection + error formatting.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_STATUS_LABELS = {
    "pending": "审批中",
    "approved": "已通过",
    "rejected": "已驳回",
    "cancelled": "已撤销",
    "cancel_pending": "销假审批中",
    "processing": "处理中",
    "replied": "已回复",
    "closed": "已办结",
    "draft": "草稿",
    "published": "已发布",
    "running": "进行中",
    "ended": "已结束",
}


def _client() -> httpx.AsyncClient:
    # trust_env=False: do NOT pick up HTTP_PROXY/HTTPS_PROXY from the env,
    # otherwise localhost:8080 gets routed through the LLM proxy and fails.
    return httpx.AsyncClient(base_url=settings.java_base_url, timeout=8.0, trust_env=False)


def _headers(user_id: str, tenant_id: str, role: str) -> dict[str, str]:
    return {
        "X-User-Id": user_id or "0",
        "X-Tenant-Id": tenant_id or "default",
        "X-User-Role": role or "student",
    }


def _label(status: str | None) -> str:
    if not status:
        return "未知"
    return _STATUS_LABELS.get(status, status)


async def _get_json(path: str, params: dict, ctx: dict) -> dict:
    async with _client() as c:
        resp = await c.get(
            path,
            params={k: v for k, v in params.items() if v is not None},
            headers=_headers(ctx["user_id"], ctx["tenant_id"], ctx["user_role"]),
        )
        resp.raise_for_status()
        return resp.json()


# ---------- query_leaves ----------

async def query_leaves(args: dict[str, Any], ctx: dict) -> str:
    scope = args.get("scope") or "my"
    status = args.get("status")

    if scope == "my":
        body = await _get_json("/api/v1/leaves/my", {"page": 1, "size": 20, "status": status}, ctx)
        data = (body.get("data") or {}).get("data") or []
        total = (body.get("data") or {}).get("total") or 0
        if not data:
            return "该用户目前没有任何请假记录。"
        counts: dict[str, int] = {}
        for item in data:
            counts[item.get("status") or "unknown"] = counts.get(item.get("status") or "unknown", 0) + 1
        lines = [f"共 {total} 条请假记录（最近 {len(data)} 条）。"]
        lines.append("状态分布：" + "、".join(f"{_label(k)} {v} 条" for k, v in counts.items()) + "。")
        lines.append("最近 5 条：")
        for item in data[:5]:
            lines.append(
                f"- {item.get('leave_type_name', '?')}，{(item.get('start_time') or '?')[:10]} ~ "
                f"{(item.get('end_time') or '?')[:10]}，{_label(item.get('status'))}，"
                f"事由：{item.get('reason', '-')}"
            )
        return "\n".join(lines)

    if scope == "class":
        body = await _get_json(
            "/api/v1/leaves/class",
            {"page": 1, "size": 50, "status": status},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        total = (body.get("data") or {}).get("total") or 0
        if not data:
            return "班级范围内暂无对应请假记录。"
        head = f"班级请假共 {total} 条"
        if status:
            head += f"（仅 {_label(status)}）"
        lines = [head + "。最近 5 条："]
        for item in data[:5]:
            lines.append(
                f"- {item.get('student_name', '?')}：{item.get('leave_type_name', '?')}，"
                f"{(item.get('start_time') or '?')[:10]} ~ {(item.get('end_time') or '?')[:10]}，"
                f"{item.get('duration_days', '?')} 天，{_label(item.get('status'))}"
            )
        return "\n".join(lines)

    if scope == "uncancelled":
        body = await _get_json("/api/v1/leaves/uncancelled", {"page": 1, "size": 50}, ctx)
        payload = body.get("data") or {}
        data = payload.get("data") or []
        total = payload.get("total") or len(data)
        if not data:
            return "班级范围内暂无未销假学生。"
        lines = [f"未销假学生共 {total} 人："]
        for item in data[:10]:
            lines.append(
                f"- {item.get('student_name', '?')}：{item.get('leave_type_name', '?')}，"
                f"应销假日期 {(item.get('end_time') or '?')[:10]}"
            )
        if len(data) > 10:
            lines.append(f"…（余 {len(data) - 10} 人略）")
        return "\n".join(lines)

    return f"未知的 scope：{scope}"


# ---------- query_notifications ----------

async def query_notifications(args: dict[str, Any], ctx: dict) -> str:
    count_body = await _get_json("/api/v1/notifications/unread-count", {}, ctx)
    unread = int(count_body.get("data") or 0)
    list_body = await _get_json("/api/v1/notifications/my", {"page": 1, "size": 10}, ctx)
    items = (list_body.get("data") or {}).get("data") or []
    if not items:
        return "该用户目前没有任何通知。"
    lines = [f"未读通知：{unread} 条。最近 5 条通知："]
    for item in items[:5]:
        read = "已读" if item.get("read_at") else "未读"
        lines.append(
            f"- [{read}] {item.get('title', '无标题')}"
            f"（{(item.get('created_at') or '')[:10]}）"
        )
    return "\n".join(lines)


# ---------- query_checkins ----------

async def query_checkins(args: dict[str, Any], ctx: dict) -> str:
    activity_id = args.get("activity_id")
    if activity_id:
        body = await _get_json(f"/api/v1/checkins/activities/{activity_id}", {}, ctx)
        act = body.get("data") or {}
        if not act:
            return f"未找到签到活动 #{activity_id}。"
        lines = [
            f"签到活动：{act.get('title', '?')}（{_label(act.get('status'))}）",
            f"- 范围：{act.get('scope', '-')}，时长：{act.get('duration_minutes', '?')} 分钟",
            f"- 准时 {act.get('on_time_count', 0)} 人，迟到 {act.get('late_count', 0)} 人，缺席 {act.get('absent_count', 0)} 人",
        ]
        return "\n".join(lines)

    body = await _get_json("/api/v1/checkins/activities", {"page": 1, "size": 20}, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return "目前没有签到活动。"
    lines = [f"签到活动共 {len(data)} 条（最近 5 条）："]
    for item in data[:5]:
        lines.append(
            f"- #{item.get('id')} {item.get('title', '?')}，"
            f"{_label(item.get('status'))}，"
            f"起始 {(item.get('start_time') or '?')[:16]}"
        )
    return "\n".join(lines)


# ---------- query_collections ----------

async def query_collections(args: dict[str, Any], ctx: dict) -> str:
    form_id = args.get("form_id")
    if form_id:
        body = await _get_json(f"/api/v1/collections/forms/{form_id}/progress", {}, ctx)
        prog = body.get("data") or {}
        if not prog:
            return f"未找到收集单 #{form_id} 的进度。"
        submitted = prog.get("submitted_count", 0)
        total = prog.get("total_count", 0)
        pending_list = prog.get("pending_students") or []
        lines = [
            f"收集单 #{form_id}：已填 {submitted}/{total}",
        ]
        if pending_list:
            names = "、".join(p.get("student_name", "?") for p in pending_list[:8])
            more = f"…（余 {len(pending_list) - 8} 人）" if len(pending_list) > 8 else ""
            lines.append(f"未填名单：{names}{more}")
        return "\n".join(lines)

    body = await _get_json("/api/v1/collections/forms", {"page": 1, "size": 20}, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return "目前没有信息收集单。"
    lines = [f"收集单共 {len(data)} 条（最近 5 条）："]
    for item in data[:5]:
        lines.append(
            f"- #{item.get('id')} {item.get('title', '?')}，"
            f"{_label(item.get('status'))}，"
            f"截止 {(item.get('deadline') or '?')[:10]}"
        )
    return "\n".join(lines)


# ---------- query_complaints ----------

async def query_complaints(args: dict[str, Any], ctx: dict) -> str:
    scope = args.get("scope") or "my"
    status = args.get("status")

    if scope == "my":
        body = await _get_json(
            "/api/v1/complaints/my",
            {"page": 1, "size": 20, "status": status},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        if not data:
            return "该用户目前没有任何诉求。"
        lines = [f"我的诉求共 {len(data)} 条（最近 5 条）："]
        for item in data[:5]:
            lines.append(
                f"- {item.get('title', '?')}（{item.get('category_label', item.get('category', '?'))}）"
                f"，{_label(item.get('status'))}，"
                f"{(item.get('created_at') or '?')[:10]}"
            )
        return "\n".join(lines)

    if scope == "handling":
        body = await _get_json(
            "/api/v1/complaints",
            {"page": 1, "size": 20, "status": status},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        if not data:
            return "目前没有待处理的诉求。"
        lines = [f"待处理诉求共 {len(data)} 条（最近 5 条）："]
        for item in data[:5]:
            lines.append(
                f"- {item.get('title', '?')}（{item.get('category_label', item.get('category', '?'))}）"
                f"，{_label(item.get('status'))}"
                + (f"，提交人 {item.get('complainant_name', '匿名')}" if not item.get("is_anonymous") else "，匿名")
            )
        return "\n".join(lines)

    return f"未知的 scope：{scope}"


# ---------- query_stats ----------

def _date_range_to_params(date_range: str | None) -> dict:
    """Map a date_range enum to (startDate, endDate) yyyy-MM-dd params.
    Returns empty dict when range is None/all, meaning "no date filter"."""
    from datetime import date, timedelta
    today = date.today()
    if not date_range or date_range == "all":
        return {}
    if date_range == "today":
        start = today
    elif date_range == "this_week":
        start = today - timedelta(days=today.weekday())
    elif date_range == "this_month":
        start = today.replace(day=1)
    elif date_range == "this_year":
        start = today.replace(month=1, day=1)
    else:
        return {}
    return {"startDate": start.isoformat(), "endDate": today.isoformat()}


_DATE_RANGE_LABELS = {
    "today": "今日",
    "this_week": "本周",
    "this_month": "本月",
    "this_year": "本年",
    "all": "全部",
}


async def query_stats(args: dict[str, Any], ctx: dict) -> str:
    metric = args.get("metric") or "leaves"
    date_range = args.get("date_range") or "this_month"
    range_params = _date_range_to_params(date_range)
    range_label = _DATE_RANGE_LABELS.get(date_range, date_range)

    if metric == "leaves":
        body = await _get_json("/api/v1/leaves/stats", range_params, ctx)
        data = body.get("data") or {}
        total = data.get("total") or 0
        by_status = data.get("byStatus") or {}
        if not total:
            return f"{range_label}请假统计：0 条。"
        parts = "、".join(f"{_label(k)} {v}" for k, v in by_status.items())
        return f"{range_label}请假共 {total} 条（{parts}）。"

    if metric == "complaints":
        # No backend stats endpoint; aggregate by fetching lists per status.
        # NOTE: PageResult.total is unreliable (pagination interceptor not wired),
        # so we count data array length with a large page size instead.
        statuses = ["pending", "processing", "replied", "closed"]
        parts = []
        total = 0
        for st in statuses:
            body = await _get_json("/api/v1/complaints", {"page": 1, "size": 200, "status": st}, ctx)
            n = len((body.get("data") or {}).get("data") or [])
            if n:
                parts.append(f"{_label(st)} {n}")
                total += n
        if not total:
            return "目前没有任何诉求记录。"
        return f"诉求共 {total} 条（{'、'.join(parts)}）。注：诉求接口暂不支持日期筛选，数字为全量。"

    if metric == "checkins":
        body = await _get_json("/api/v1/checkins/activities", {"page": 1, "size": 200}, ctx)
        total = len((body.get("data") or {}).get("data") or [])
        return f"签到活动共 {total} 场。注：签到接口暂不支持日期筛选，数字为全量。"

    if metric == "collections":
        statuses = ["draft", "published", "closed"]
        parts = []
        total = 0
        for st in statuses:
            body = await _get_json("/api/v1/collections/forms", {"page": 1, "size": 200, "status": st}, ctx)
            n = len((body.get("data") or {}).get("data") or [])
            if n:
                parts.append(f"{_label(st)} {n}")
                total += n
        if not total:
            return "目前没有任何信息收集单。"
        return f"信息收集单共 {total} 条（{'、'.join(parts)}）。注：收集单接口暂不支持日期筛选，数字为全量。"

    return f"未知的 metric：{metric}"


# ---------- query_work_logs ----------

async def query_work_logs(args: dict[str, Any], ctx: dict) -> str:
    category = args.get("category")
    date_range = args.get("date_range")
    params: dict[str, Any] = {"page": 1, "size": 20}
    if category:
        params["category"] = category
    params.update(_date_range_to_params(date_range))
    body = await _get_json("/api/v1/work-logs", params, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return "暂无工作日志。"
    lines = [f"共返回 {len(data)} 条工作日志（最近 5 条）："]
    for item in data[:5]:
        lines.append(
            f"- [{item.get('category', '?')}] {item.get('title', '?')}"
            f"（{item.get('log_date', '?')}）"
        )
    return "\n".join(lines)


# ---------- query_violations ----------

async def query_violations(args: dict[str, Any], ctx: dict) -> str:
    scope = args.get("scope") or "recent"
    student_id = args.get("student_id")
    params: dict[str, Any] = {"page": 1, "size": 20}
    if scope == "student":
        if not student_id:
            return "查询学生违纪需要提供 student_id。"
        params["studentId"] = student_id
    elif args.get("category"):
        params["category"] = args["category"]

    body = await _get_json("/api/v1/violations", params, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return "暂无违纪记录。"
    head = f"违纪记录共 {len(data)} 条" + (f"（学生 #{student_id}）" if scope == "student" else "") + "："
    lines = [head]
    for item in data[:5]:
        lines.append(
            f"- {item.get('student_name', '?')}：{item.get('category', '?')}，"
            f"{(item.get('occurred_at') or '?')[:10]}，{item.get('description', '-')[:30]}"
        )

    if scope == "student" and student_id:
        pbody = await _get_json("/api/v1/punishments", {"page": 1, "size": 20, "studentId": student_id}, ctx)
        punishments = (pbody.get("data") or {}).get("data") or []
        if punishments:
            lines.append(f"处分共 {len(punishments)} 条：")
            for p in punishments[:5]:
                lines.append(
                    f"- {p.get('level', '?')}（{p.get('status', '?')}），"
                    f"生效 {p.get('effective_date', '?')}，事由：{p.get('reason', '-')[:30]}"
                )
    return "\n".join(lines)


# ---------- query_work_study ----------

async def query_work_study(args: dict[str, Any], ctx: dict) -> str:
    scope = args.get("scope") or "positions"

    if scope == "positions":
        params: dict[str, Any] = {"page": 1, "size": 20, "status": "open"}
        if args.get("prefer_financial_aid") is True:
            params["preferFinancialAid"] = "true"
        body = await _get_json("/api/v1/work-study/positions", params, ctx)
        data = (body.get("data") or {}).get("data") or []
        if not data:
            return "目前没有在招的勤工助学岗位。"
        lines = [f"在招岗位共 {len(data)} 个（最近 5 个）："]
        for item in data[:5]:
            lines.append(
                f"- #{item.get('id')} {item.get('title', '?')}（{item.get('department_name', '?')}），"
                f"时薪 ¥{item.get('hourly_rate', '?')}，"
                f"已招 {item.get('hired_count', 0)}/{item.get('headcount', '?')}"
                + ("，优先资助生" if item.get('prefer_financial_aid') else "")
            )
        return "\n".join(lines)

    if scope == "my_applications":
        user_id = ctx.get("user_id") or "0"
        body = await _get_json(
            "/api/v1/work-study/applications",
            {"page": 1, "size": 20, "studentId": user_id},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        if not data:
            return "尚未提交过勤工助学申请。"
        lines = [f"我的申请共 {len(data)} 条："]
        for item in data[:5]:
            lines.append(
                f"- 岗位 #{item.get('position_id')}，{_label(item.get('status'))}，"
                f"提交于 {(item.get('created_at') or '?')[:10]}"
            )
        return "\n".join(lines)

    return f"未知的 scope：{scope}"


# ---------- Registry ----------

Handler = Callable[[dict[str, Any], dict], Awaitable[str]]

TOOLS: list[dict[str, Any]] = [
    {
        "name": "query_leaves",
        "description": "查询请假记录。scope=my 查当前学生自己的请假；scope=class 查当前辅导员管辖班级请假（可选 status 筛选）；scope=uncancelled 查未销假学生名单。",
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["my", "class", "uncancelled"],
                    "description": "my=学生本人；class=辅导员班级；uncancelled=未销假名单",
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "approved", "rejected", "cancelled"],
                    "description": "状态过滤（可选），仅对 my/class 生效",
                },
            },
            "required": ["scope"],
        },
        "allowed_roles": {
            "my": {"student"},
            "class": {"counselor", "dean", "school_admin"},
            "uncancelled": {"counselor", "dean", "school_admin"},
        },
    },
    {
        "name": "query_notifications",
        "description": "查询当前用户的通知（未读数量 + 最近 5 条标题）。",
        "input_schema": {"type": "object", "properties": {}},
        "allowed_roles": None,  # all roles
    },
    {
        "name": "query_checkins",
        "description": "查询签到活动。不传 activity_id 返回最近活动列表；传 activity_id 返回该活动的出勤统计。辅导员/管理员专用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "activity_id": {"type": "integer", "description": "签到活动 ID，不填返回列表"},
            },
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_collections",
        "description": "查询信息收集单。不传 form_id 返回最近收集单列表；传 form_id 返回该收集单填报进度和未填名单。辅导员/管理员专用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "form_id": {"type": "integer", "description": "收集单 ID，不填返回列表"},
            },
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_stats",
        "description": "统计数据查询。辅导员/管理员专用。返回按状态分布的计数。metric=leaves 支持 date_range 过滤；其他 metric 暂不支持日期过滤。",
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": ["leaves", "complaints", "checkins", "collections"],
                    "description": "统计指标：leaves=请假；complaints=诉求；checkins=签到活动；collections=信息收集单",
                },
                "date_range": {
                    "type": "string",
                    "enum": ["today", "this_week", "this_month", "this_year", "all"],
                    "description": "日期范围（仅 leaves 生效），默认 this_month",
                },
            },
            "required": ["metric"],
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_work_logs",
        "description": "查询当前用户（辅导员）的工作日志。可按 category 和 date_range 过滤。辅导员/管理员专用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "日志分类（可选，如 daily/meeting/visit）"},
                "date_range": {
                    "type": "string",
                    "enum": ["today", "this_week", "this_month", "this_year", "all"],
                    "description": "日期范围（可选）",
                },
            },
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_violations",
        "description": "查询学生违纪与处分记录。scope=recent 看近期违纪列表；scope=student 传 student_id 看指定学生的违纪+处分。辅导员/管理员专用。",
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["recent", "student"],
                    "description": "recent=近期所有；student=指定学生",
                },
                "student_id": {"type": "integer", "description": "学生 ID，scope=student 必填"},
                "category": {"type": "string", "description": "违纪类别（可选，scope=recent 生效）"},
            },
            "required": ["scope"],
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_work_study",
        "description": "查询勤工助学信息。scope=positions 返回在招岗位列表（学生可用）；scope=my_applications 返回当前学生的申请列表。",
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["positions", "my_applications"],
                    "description": "positions=在招岗位；my_applications=我的申请",
                },
                "prefer_financial_aid": {
                    "type": "boolean",
                    "description": "仅看优先资助生的岗位（可选，scope=positions 生效）",
                },
            },
            "required": ["scope"],
        },
        "allowed_roles": {
            "positions": {"student", "counselor", "dean", "school_admin"},
            "my_applications": {"student"},
        },
    },
    {
        "name": "query_complaints",
        "description": "查询诉求。scope=my 查学生自己提交的诉求进度；scope=handling 查辅导员/管理员待处理的诉求。",
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["my", "handling"],
                    "description": "my=学生本人提交；handling=辅导员/管理员待办",
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "processing", "replied", "closed"],
                    "description": "状态过滤（可选）",
                },
            },
            "required": ["scope"],
        },
        "allowed_roles": {
            "my": {"student"},
            "handling": {"counselor", "dean", "school_admin"},
        },
    },
]

HANDLERS: dict[str, Handler] = {
    "query_leaves": query_leaves,
    "query_notifications": query_notifications,
    "query_checkins": query_checkins,
    "query_collections": query_collections,
    "query_complaints": query_complaints,
    "query_stats": query_stats,
    "query_work_logs": query_work_logs,
    "query_violations": query_violations,
    "query_work_study": query_work_study,
}


def is_role_allowed(tool: dict, args: dict, role: str) -> bool:
    """Whether `role` may call `tool` with the given args.

    `allowed_roles` shapes:
      - None            → all roles
      - {scope_value: {role...}}  → per-scope gating, using args["scope"]
      - {None: {role...}}         → tool-wide role whitelist (scope-free tool)
    """
    rules = tool.get("allowed_roles")
    if rules is None:
        return True
    if None in rules:
        return role in rules[None]
    scope = (args or {}).get("scope")
    allowed = rules.get(scope)
    return bool(allowed and role in allowed)


def tools_for_role(role: str) -> list[dict[str, Any]]:
    """Return tool definitions visible to `role`. Scope-gated tools are kept
    in the list as-is; per-call gating happens in `is_role_allowed` at dispatch."""
    out = []
    for t in TOOLS:
        rules = t.get("allowed_roles")
        if rules is None:
            out.append(t)
        elif None in rules:
            if role in rules[None]:
                out.append(t)
        else:
            if any(role in r for r in rules.values()):
                out.append(t)
    # Strip the non-Anthropic metadata before returning.
    return [{k: v for k, v in t.items() if k != "allowed_roles"} for t in out]


async def execute(
    tool_name: str,
    args: dict[str, Any],
    user_id: str,
    tenant_id: str,
    user_role: str,
) -> str:
    handler = HANDLERS.get(tool_name)
    if handler is None:
        return f"未知查询工具：{tool_name}"

    tool_def = next((t for t in TOOLS if t["name"] == tool_name), None)
    if tool_def and not is_role_allowed(tool_def, args or {}, user_role or "student"):
        return "当前角色无权调用此查询。"

    ctx = {"user_id": user_id, "tenant_id": tenant_id, "user_role": user_role}
    try:
        return await handler(args or {}, ctx)
    except httpx.HTTPStatusError as e:
        logger.warning("query tool %s HTTP %s: %s", tool_name, e.response.status_code, e.response.text[:200])
        return f"查询失败（HTTP {e.response.status_code}）"
    except Exception:
        logger.exception("query tool %s failed", tool_name)
        return "查询失败，请稍后重试。"
