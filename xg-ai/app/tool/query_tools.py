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
import re
from datetime import date as date_cls, datetime, timedelta
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

import httpx

from app.config import settings
from app.tool import workstudy_prompts as ws_p

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
        lines = [head + "。最近 10 条（含 id 供 action refs 引用）："]
        for item in data[:10]:
            lines.append(
                f"- id={item.get('id')}, 学生={item.get('student_name', '?')}"
                f"(studentId={item.get('student_id')}), {item.get('leave_type_name', '?')},"
                f" {(item.get('start_time') or '?')[:10]}~{(item.get('end_time') or '?')[:10]},"
                f" {item.get('duration_days', '?')}天, {_label(item.get('status'))}"
            )
        return "\n".join(lines)

    if scope == "student":
        # Counselor scoping — reuse /leaves/class (already filtered to counselor's
        # students), then pick the requested student_id. Returns empty if the
        # student isn't in the caller's class, which is the correct privacy
        # outcome without adding a new Java endpoint.
        student_id = args.get("student_id")
        if student_id is None:
            return "scope=student 需要提供 student_id。"
        try:
            sid_i = int(student_id)
        except (TypeError, ValueError):
            return f"student_id 格式不正确：{student_id}"
        months = int(args.get("months") or 0)
        # Bump page size — we're filtering class-wide records down to one student.
        body = await _get_json(
            "/api/v1/leaves/class",
            {"page": 1, "size": 200, "status": status},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        mine = [d for d in data if str(d.get("student_id")) == str(sid_i)]
        if months > 0:
            from datetime import datetime, timedelta, timezone
            cutoff = (datetime.now(timezone.utc) - timedelta(days=months * 30)).isoformat()
            mine = [d for d in mine if (d.get("start_time") or "") >= cutoff]
        sname = mine[0].get("student_name") if mine else f"#{sid_i}"
        if not mine:
            hint = f"近 {months} 个月" if months > 0 else "班级范围内"
            return f"学生 {sname}（id={sid_i}）{hint}暂无请假记录。"
        head = f"学生 {sname}（id={sid_i}）请假共 {len(mine)} 条"
        if status:
            head += f"（仅 {_label(status)}）"
        if months > 0:
            head += f"（近 {months} 个月）"
        lines = [head + "："]
        for item in mine[:15]:
            lines.append(
                f"- id={item.get('id')}, {item.get('leave_type_name', '?')},"
                f" {(item.get('start_time') or '?')[:10]}~{(item.get('end_time') or '?')[:10]},"
                f" {item.get('duration_days', '?')}天, {_label(item.get('status'))},"
                f" 事由：{item.get('reason', '-')}"
            )
        if len(mine) > 15:
            lines.append(f"…（余 {len(mine) - 15} 条略）")
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
    elif scope == "pending_approval":
        params["approvalStatus"] = "pending"
    elif args.get("category"):
        params["category"] = args["category"]

    body = await _get_json("/api/v1/violations", params, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return "暂无违纪记录。" if scope != "pending_approval" else "当前没有待审批的违纪。"
    if scope == "pending_approval":
        head = f"待审批违纪共 {len(data)} 条："
    else:
        head = f"违纪记录共 {len(data)} 条" + (f"（学生 #{student_id}）" if scope == "student" else "") + "："
    lines = [head]
    for item in data[:5]:
        suffix = ""
        if scope == "pending_approval":
            suffix = f"，记录人：{item.get('recorder_name', '?')}，ID={item.get('id', '?')}"
        lines.append(
            f"- {item.get('student_name', '?')}：{item.get('category', '?')}，"
            f"{(item.get('occurred_at') or '?')[:10]}，{item.get('description', '-')[:30]}{suffix}"
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


# ---------- query_student_events ----------

_EVENT_TYPE_LABELS = {
    "leave_submit": "提交请假",
    "leave_rejected": "请假被驳回",
    "leave_cancelled": "请假已撤销",
    "checkin_success": "按时签到",
    "checkin_absent": "签到缺席",
    "checkin_late": "签到迟到",
    "violation_recorded": "违纪记录",
    "notification_confirmed": "已确认通知",
    "notification_unconfirmed": "未确认通知",
    "collection_filled": "已填收集单",
    "collection_overdue": "收集单逾期",
    "counselor_talk_recorded": "谈话记录",
}

# Event types that count as "negative" behavior for quick summary.
_NEGATIVE_EVENT_TYPES = {
    "checkin_absent",
    "checkin_late",
    "leave_rejected",
    "violation_recorded",
    "notification_unconfirmed",
    "collection_overdue",
}


async def query_student_events(args: dict[str, Any], ctx: dict) -> str:
    from datetime import datetime, timedelta, timezone

    students = args.get("students") or []
    days = int(args.get("days") or 30)

    if not students:
        return "查询学生事件需要提供 students（至少一位学生的 id）。"

    # Cap request fan-out.
    students = students[:10]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    out_lines: list[str] = []
    total_neg = 0
    total_events = 0

    for s in students:
        sid = s.get("id")
        sname = (s.get("name") or "").strip() or f"#{sid}"
        if sid is None:
            continue
        body = await _get_json(
            f"/api/v1/students/{sid}/events",
            {"page": 1, "size": 50},
            ctx,
        )
        data = (body.get("data") or {}).get("data") or []
        # Filter to the requested window — endpoint returns latest first.
        recent = [
            e for e in data
            if (e.get("occurredAt") or e.get("occurred_at") or "") >= cutoff
        ]
        total_events += len(recent)

        if not recent:
            out_lines.append(f"【{sname}】最近 {days} 天无异常事件。")
            continue

        # Group by event type.
        by_type: dict[str, int] = {}
        for e in recent:
            t = e.get("eventType") or e.get("event_type") or "unknown"
            by_type[t] = by_type.get(t, 0) + 1
        neg = sum(n for t, n in by_type.items() if t in _NEGATIVE_EVENT_TYPES)
        total_neg += neg

        summary = "、".join(
            f"{_EVENT_TYPE_LABELS.get(t, t)} {n} 次" for t, n in by_type.items()
        )
        out_lines.append(f"【{sname}】最近 {days} 天共 {len(recent)} 条事件：{summary}。")

        # Show up to 5 most recent individual events with a date.
        detail_lines = []
        for e in recent[:5]:
            occ = (e.get("occurredAt") or e.get("occurred_at") or "")[:10]
            tlabel = _EVENT_TYPE_LABELS.get(
                e.get("eventType") or e.get("event_type") or "", "?"
            )
            detail_lines.append(f"  - {occ} {tlabel}")
        if detail_lines:
            out_lines.extend(detail_lines)

    head = f"共查询 {len(students)} 位学生，{total_events} 条事件，其中负面/需关注事件 {total_neg} 次。"
    return head + "\n" + "\n".join(out_lines)


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


# ---------- find_workstudy_positions_by_preference ----------

async def find_workstudy_positions_by_preference(args: dict[str, Any], ctx: dict) -> str:
    """学生侧：把自然语言偏好转成结构化筛选 → 走 student-scope 资格预筛 → 输出匹配岗位。"""
    lang = ctx.get("user_lang", "zh")
    keyword = (args.get("keyword") or "").strip().lower()
    position_type = args.get("position_type")
    min_rate = args.get("min_rate")
    campus = (args.get("campus") or "").strip()

    params: dict[str, Any] = {"page": 1, "size": 50, "status": "open", "studentScope": "true"}
    if position_type in ("fixed", "temporary"):
        params["positionType"] = position_type
    body = await _get_json("/api/v1/work-study/positions", params, ctx)
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return ws_p.t("FIND_NO_RESULTS", lang)

    def matches(p: dict) -> bool:
        if keyword:
            haystack = " ".join(str(p.get(k) or "") for k in
                                ("title", "description", "department_name", "work_location", "campus")).lower()
            if keyword not in haystack:
                return False
        if min_rate is not None:
            rate = p.get("salary_amount") or p.get("hourly_rate")
            try:
                if rate is None or float(rate) < float(min_rate):
                    return False
            except (TypeError, ValueError):
                return False
        if campus and campus.lower() not in (str(p.get("campus") or "").lower()):
            return False
        return True

    filtered = [p for p in data if matches(p)]
    if not filtered:
        return ws_p.t("FIND_NONE_AFTER_FILTER", lang).format(total=len(data))

    # localized small labels
    unit_zh = {"hour": "时", "day": "天", "month": "月", "per_task": "次"}
    unit_en = {"hour": "hr", "day": "day", "month": "mo", "per_task": "task"}
    unit_map = unit_en if lang == "en" else unit_zh
    ptype_zh = {"fixed": "固定", "temporary": "临时"}
    ptype_en = {"fixed": "fixed", "temporary": "temporary"}
    ptype_map = ptype_en if lang == "en" else ptype_zh

    lines = [ws_p.t("FIND_HEADER", lang).format(n=len(filtered))]
    for p in filtered[:8]:
        rate = p.get("salary_amount") or p.get("hourly_rate") or "?"
        unit = unit_map.get(p.get("salary_unit") or "hour", p.get("salary_unit") or "")
        ptype = ptype_map.get(p.get("position_type") or "fixed", p.get("position_type") or "")
        lines.append(ws_p.t("FIND_ITEM", lang).format(
            pid=p.get('id'), title=p.get('title', '?'),
            dept=p.get('department_name') or '?', ptype=ptype,
            rate=rate, unit=unit,
            hired=p.get('hired_count', 0), headcount=p.get('headcount', '?'),
            campus=p.get('campus') or '-',
        ))
    lines.append(ws_p.t("FIND_FOOTER", lang))
    return "\n".join(lines)


# ---------- match_workstudy_positions_to_schedule ----------

def _slot_overlap_minutes(a: dict, b: dict) -> int:
    """Both slots have day/start/end ('HH:MM'). Return overlap in minutes if same day."""
    if (a.get("day") or "").lower() != (b.get("day") or "").lower():
        return 0
    def to_min(t: str) -> int:
        try:
            h, m = t.split(":")
            return int(h) * 60 + int(m)
        except (ValueError, AttributeError):
            return -1
    a_s, a_e = to_min(a.get("start", "")), to_min(a.get("end", ""))
    b_s, b_e = to_min(b.get("start", "")), to_min(b.get("end", ""))
    if min(a_s, a_e, b_s, b_e) < 0:
        return 0
    overlap = max(0, min(a_e, b_e) - max(a_s, b_s))
    return overlap


async def match_workstudy_positions_to_schedule(args: dict[str, Any], ctx: dict) -> str:
    """学生侧：传入空余时间段，按时间覆盖度排序匹配岗位。"""
    lang = ctx.get("user_lang", "zh")
    free_slots = args.get("free_slots") or []
    if not isinstance(free_slots, list) or not free_slots:
        return ws_p.t("MATCH_NEED_SLOTS", lang)

    body = await _get_json(
        "/api/v1/work-study/positions",
        {"page": 1, "size": 50, "status": "open", "studentScope": "true"},
        ctx,
    )
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return ws_p.t("MATCH_NO_OPEN_POSITIONS", lang)

    import json as _json
    scored = []
    for p in data:
        slots_raw = p.get("time_slots")
        if not slots_raw:
            # 岗位没声明时间要求 → 视为不冲突，给中等分
            scored.append((p, -1, 0))
            continue
        slots = slots_raw if isinstance(slots_raw, list) else (
            _json.loads(slots_raw) if isinstance(slots_raw, str) else []
        )
        # 总要求分钟
        def slot_minutes(s: dict) -> int:
            def to_min(t: str) -> int:
                h, m = t.split(":")
                return int(h) * 60 + int(m)
            try:
                return max(0, to_min(s.get("end", "")) - to_min(s.get("start", "")))
            except Exception:
                return 0
        required = sum(slot_minutes(s) for s in slots) or 1
        covered = sum(_slot_overlap_minutes(s, f) for s in slots for f in free_slots)
        ratio = round(min(1.0, covered / required), 2)
        scored.append((p, ratio, covered))

    # 排序：先按覆盖率（无要求的排中间），再按薪资（次要）
    def sort_key(item):
        p, ratio, _ = item
        if ratio < 0:
            return (0.5, 0)   # 无时间要求
        return (ratio, 1)
    scored.sort(key=sort_key, reverse=True)

    head_lines = [ws_p.t("MATCH_HEADER", lang).format(n=len(scored))]
    out = []
    for p, ratio, covered in scored[:8]:
        ratio_label = (
            ws_p.t("MATCH_RATIO_NO_REQUIREMENT", lang) if ratio < 0
            else ws_p.t("MATCH_RATIO_FORMAT", lang).format(pct=int(ratio * 100), h=covered // 60, m=covered % 60)
        )
        out.append(ws_p.t("MATCH_ITEM", lang).format(
            pid=p.get('id'), title=p.get('title', '?'),
            dept=p.get('department_name') or '?', ratio_label=ratio_label,
        ))
    return "\n".join(head_lines + out)


# ---------- summarize_workstudy_applicants ----------

async def summarize_workstudy_applicants(args: dict[str, Any], ctx: dict) -> str:
    """用工单位/岗位负责人侧：把某岗位的申请压成对比卡。"""
    lang = ctx.get("user_lang", "zh")
    pid = args.get("position_id")
    if pid is None:
        return "position_id is required" if lang == "en" else "需要提供 position_id"
    body = await _get_json(
        "/api/v1/work-study/applications",
        {"page": 1, "size": 50, "positionId": pid},
        ctx,
    )
    data = (body.get("data") or {}).get("data") or []
    if not data:
        return ws_p.t("SUMMARIZE_NO_DATA", lang).format(pid=pid)

    pending = [a for a in data if a.get("status") == "pending"]
    hired = [a for a in data if a.get("status") == "hired"]
    rejected = [a for a in data if a.get("status") == "rejected"]
    head = ws_p.t("SUMMARIZE_HEADER", lang).format(
        pid=pid, total=len(data),
        pending=len(pending), hired=len(hired), rejected=len(rejected),
    )
    lines = [head, ws_p.t("SUMMARIZE_PENDING_TITLE", lang) if pending else ws_p.t("SUMMARIZE_NO_PENDING", lang)]
    aid_dict = ws_p.t("APPLICANT_AID_LABEL", lang) or {}
    aid_unfilled = "not filled" if lang == "en" else "未填"
    for a in pending[:8]:
        aid = aid_dict.get(a.get("financial_aid_level") or "", aid_unfilled)
        intro = (a.get("intro") or "").strip().replace("\n", " ")
        if len(intro) > 60:
            intro = intro[:60] + "…"
        lines.append(ws_p.t("SUMMARIZE_ITEM", lang).format(
            aid=a.get('id'),
            sname=a.get('student_name') or ('#' + str(a.get('student_id'))),
            aid_label=aid,
            date=(a.get('created_at') or '?')[:10],
            intro=intro or '-',
        ))
    if len(pending) > 8:
        lines.append(ws_p.t("SUMMARIZE_TRUNCATED", lang).format(n=len(pending) - 8))
    return "\n".join(lines)


# ---------- draft_workstudy_application_intro ----------


async def draft_workstudy_application_intro(args: dict[str, Any], ctx: dict) -> str:
    """学生侧：基于岗位描述拼一段可直接使用的申请理由草稿。
    草稿模板见 ``workstudy_prompts.py`` —— 文案在那里集中，便于管理员调语气。"""
    lang = ctx.get("user_lang", "zh")
    pid = args.get("position_id")
    if pid is None:
        return "position_id is required." if lang == "en" else "需要提供 position_id。"
    student_brief = (args.get("student_brief") or "").strip()

    body = await _get_json(f"/api/v1/work-study/positions/{pid}", {}, ctx)
    p = (body.get("data") or body) if isinstance(body, dict) else {}
    if not p or not p.get("id"):
        return (
            f"Position #{pid} not found, cannot draft."
            if lang == "en" else f"找不到岗位 #{pid}，无法生成草稿。"
        )

    fallback_title = "this position" if lang == "en" else "该岗位"
    title = p.get("title") or fallback_title
    if lang == "en":
        fallback_dept = "the hiring unit"
        emp_pattern = "Employer #{eid}"
    else:
        fallback_dept = "用人单位"
        emp_pattern = "用人单位 #{eid}"
    dept = (
        p.get("department_name")
        or (p.get("employer_id") and emp_pattern.format(eid=p['employer_id']))
        or fallback_dept
    )
    requirements = (p.get("requirements") or "").strip()
    description = (p.get("description") or "").strip()
    if lang == "en":
        ptype_map = {"fixed": "fixed-term", "temporary": "temporary"}
    else:
        ptype_map = {"fixed": "固定岗", "temporary": "临时岗"}
    ptype = ptype_map.get(p.get("position_type"))
    campus = p.get("campus") or ""
    work_location = p.get("work_location") or ""

    # 时间承诺
    import json as _json
    slots_raw = p.get("time_slots")
    slots = []
    if slots_raw:
        try:
            slots = slots_raw if isinstance(slots_raw, list) else _json.loads(slots_raw)
        except Exception:
            slots = []
    time_pledge = ""
    if slots:
        day_dict = ws_p.t("DAY_LABEL", lang) or {}
        sep = ", " if lang == "en" else "、"
        readable = sep.join(
            f"{day_dict.get(s.get('day'), s.get('day'))} {s.get('start')}-{s.get('end')}"
            for s in slots[:5]
        )
        time_pledge = ws_p.t("DRAFT_TIME_PLEDGE", lang).format(readable=readable)

    # 资助等级（只对 zh 起效；英文 brief 中文 aid label 命中率近 0，留作纯 zh 路径）
    aid_pledge = ""
    if student_brief and lang == "zh":
        for k, label in ws_p.AID_LABEL.items():
            if k in student_brief or label in student_brief:
                aid_pledge = ws_p.DRAFT_AID_PLEDGE.format(aid_label=label)
                break

    # 拼正文
    if lang == "en":
        ptype_suffix = f"({ptype})" if ptype else ""
        end_punct = "."
    else:
        ptype_suffix = f"（{ptype}）" if ptype else ""
        end_punct = "。"

    paragraphs = []
    paragraphs.append(ws_p.t("DRAFT_OPENING", lang).format(
        dept=dept, title=title, ptype_suffix=ptype_suffix,
    ))
    if student_brief:
        paragraphs.append(student_brief if student_brief.endswith(end_punct) else student_brief + end_punct)
    if aid_pledge:
        paragraphs.append(aid_pledge)
    if requirements:
        paragraphs.append(ws_p.t("DRAFT_REQUIREMENTS_SECTION", lang).format(
            requirements=f"{requirements[:120]}{'…' if len(requirements) > 120 else ''}",
        ))
    elif description:
        paragraphs.append(ws_p.t("DRAFT_DESCRIPTION_FALLBACK", lang).format(
            description=f"{description[:80]}{'…' if len(description) > 80 else ''}",
        ))
    if work_location or campus:
        loc = (campus + " " + work_location).strip()
        paragraphs.append(ws_p.t("DRAFT_LOCATION", lang).format(loc=loc))
    if time_pledge:
        paragraphs.append(time_pledge)
    paragraphs.append(ws_p.t("DRAFT_CLOSING", lang))

    return ws_p.t("DRAFT_WRAPPER", lang).format(draft="\n\n".join(paragraphs))


# ---------- detect_workstudy_salary_anomaly ----------

async def detect_workstudy_salary_anomaly(args: dict[str, Any], ctx: dict) -> str:
    """资助中心侧：扫描某月薪资申报，按 position 历史均值×threshold_factor 标异常。"""
    lang = ctx.get("user_lang", "zh")
    month = args.get("month")     # yyyy-MM；不传 = 全部
    factor = float(args.get("threshold_factor") or 1.5)
    month_label = month or ("all months" if lang == "en" else "全部月份")

    # 1) 拉本月（或全部）pending+confirmed 的薪资 → 异常候选
    body_now = await _get_json(
        "/api/v1/work-study/salaries",
        {"page": 1, "size": 100, "month": month},
        ctx,
    )
    candidates = (body_now.get("data") or {}).get("data") or []
    if not candidates:
        return ws_p.t("ANOMALY_NO_DATA", lang).format(month=month_label)

    # 2) 拉历史 100 条（不限 month）→ 按 position_id 算均值
    body_hist = await _get_json("/api/v1/work-study/salaries", {"page": 1, "size": 200}, ctx)
    history = (body_hist.get("data") or {}).get("data") or []

    sum_by_pos: dict[Any, float] = {}
    cnt_by_pos: dict[Any, int] = {}
    for row in history:
        pid = row.get("position_id")
        try:
            amt = float(row.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if pid is None or amt <= 0:
            continue
        sum_by_pos[pid] = sum_by_pos.get(pid, 0.0) + amt
        cnt_by_pos[pid] = cnt_by_pos.get(pid, 0) + 1

    anomalies = []
    for r in candidates:
        pid = r.get("position_id")
        try:
            amt = float(r.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        n = cnt_by_pos.get(pid, 0)
        # 历史样本 <2 时跳过（无法判断基线）
        if n < 2:
            continue
        avg = sum_by_pos[pid] / n
        if amt > avg * factor:
            anomalies.append({
                "salary_id": r.get("id"), "student_id": r.get("student_id"),
                "position_id": pid, "month": r.get("month"),
                "amount": amt, "avg": round(avg, 2), "ratio": round(amt / avg, 2),
                "status": r.get("status"),
            })

    if not anomalies:
        return ws_p.t("ANOMALY_NONE", lang).format(n=len(candidates), month=month_label, factor=factor)

    anomalies.sort(key=lambda x: -x["ratio"])
    lines = [ws_p.t("ANOMALY_HEADER", lang).format(n=len(anomalies), factor=factor)]
    for a in anomalies[:8]:
        lines.append(ws_p.t("ANOMALY_ITEM", lang).format(
            sid=a['salary_id'], stu=a['student_id'], pid=a['position_id'], month=a['month'],
            amt=f"{a['amount']:.2f}", avg=f"{a['avg']:.2f}", ratio=a['ratio'],
            status_label=_label(a['status']),
        ))
    if len(anomalies) > 8:
        lines.append(ws_p.t("ANOMALY_TRUNCATED", lang).format(n=len(anomalies) - 8))
    return "\n".join(lines)


# ---------- suggest_workstudy_position_template ----------

async def suggest_workstudy_position_template(args: dict[str, Any], ctx: dict) -> str:
    """用工/学工侧：基于历史岗位（可选某 employer）生成本学年岗位发布模板建议。"""
    lang = ctx.get("user_lang", "zh")
    employer_id = args.get("employer_id")
    params: dict[str, Any] = {"page": 1, "size": 50}
    if employer_id is not None:
        params["employerId"] = employer_id
    body = await _get_json("/api/v1/work-study/positions", params, ctx)
    rows = (body.get("data") or {}).get("data") or []
    if not rows:
        return ws_p.t("SUGGEST_NO_HISTORY", lang)

    type_count: dict[str, int] = {}
    unit_count: dict[str, int] = {}
    rates: list[float] = []
    weekly: list[int] = []
    headcounts: list[int] = []
    campuses: dict[str, int] = {}
    for r in rows:
        t = r.get("position_type")
        if t:
            type_count[t] = type_count.get(t, 0) + 1
        u = r.get("salary_unit")
        if u:
            unit_count[u] = unit_count.get(u, 0) + 1
        amt = r.get("salary_amount") or r.get("hourly_rate")
        try:
            if amt is not None:
                rates.append(float(amt))
        except (TypeError, ValueError):
            pass
        if r.get("weekly_hours"):
            try:
                weekly.append(int(r["weekly_hours"]))
            except (TypeError, ValueError):
                pass
        if r.get("headcount"):
            try:
                headcounts.append(int(r["headcount"]))
            except (TypeError, ValueError):
                pass
        c = r.get("campus")
        if c:
            campuses[c] = campuses.get(c, 0) + 1

    def top(d: dict[str, int]) -> str:
        if not d:
            return "—"
        return max(d.items(), key=lambda kv: kv[1])[0]

    def avg(xs: list[float]) -> str:
        return f"{sum(xs) / len(xs):.2f}" if xs else "—"

    def median(xs: list[int]) -> str:
        if not xs:
            return "—"
        s = sorted(xs)
        return str(s[len(s) // 2])

    main_type = top(type_count)
    main_unit = top(unit_count)
    if lang == "en":
        type_map = {"fixed": "fixed-term", "temporary": "temporary"}
        unit_map = {"hour": "hour", "day": "day", "month": "month", "per_task": "task"}
        emp_suffix = f" (employer #{employer_id})" if employer_id else ""
    else:
        type_map = {"fixed": "固定岗", "temporary": "临时岗"}
        unit_map = {"hour": "时", "day": "天", "month": "月", "per_task": "次"}
        emp_suffix = f"（employer #{employer_id}）" if employer_id else ""
    label_t = type_map.get(main_type, main_type)
    unit_label = unit_map.get(main_unit, main_unit)

    header = ws_p.t("SUGGEST_HEADER", lang).format(
        n=len(rows), employer_suffix=emp_suffix,
    )
    body = ws_p.t("SUGGEST_BODY", lang).format(
        type_label=label_t,
        rate_avg=avg(rates), unit_label=unit_label, rate_n=len(rates),
        weekly_med=median(weekly), headcount_med=median(headcounts),
        campus_top=top(campuses),
    )
    return header + "\n" + body


# ---------- workstudy_dashboard_brief ----------

async def workstudy_dashboard_brief(args: dict[str, Any], ctx: dict) -> str:
    """多角色仪表板播报：3 句话总览 + 1 条建议。
    role 可省略，按 ctx.user_role 决定口径；ctx.user_lang ('zh'/'en') 切换语种。"""
    role = args.get("role") or ctx.get("user_role") or "student_affairs_officer"
    lang = ctx.get("user_lang", "zh")

    if role == "student":
        pos = await _get_json(
            "/api/v1/work-study/positions",
            {"page": 1, "size": 1, "status": "open", "studentScope": "true"},
            ctx,
        )
        my = await _get_json(
            "/api/v1/work-study/applications",
            {"page": 1, "size": 50, "studentId": ctx.get("user_id") or "0"},
            ctx,
        )
        my_data = (my.get("data") or {}).get("data") or []
        pending = sum(1 for a in my_data if a.get("status") == "pending")
        hired = sum(1 for a in my_data if a.get("status") == "hired")
        open_total = (pos.get("data") or {}).get("total") or 0
        body = ws_p.t("DASHBOARD_STUDENT", lang).format(
            open_total=open_total, submitted=len(my_data), pending=pending, hired=hired,
        )
        if pending == 0 and hired == 0:
            body += ws_p.t("DASHBOARD_STUDENT_NO_APPS_HINT", lang)
        return body

    if role == "aid_center_officer":
        pending_q = await _get_json(
            "/api/v1/work-study/salaries", {"page": 1, "size": 1, "status": "pending"}, ctx,
        )
        confirmed_q = await _get_json(
            "/api/v1/work-study/salaries", {"page": 1, "size": 1, "status": "confirmed"}, ctx,
        )
        p_total = (pending_q.get("data") or {}).get("total") or 0
        c_total = (confirmed_q.get("data") or {}).get("total") or 0
        body = ws_p.t("DASHBOARD_AID_CENTER", lang).format(pending=p_total, confirmed=c_total)
        if p_total > 0:
            body += ws_p.t("DASHBOARD_AID_CENTER_HINT", lang)
        return body

    # 默认（用工/学工/管理员）：在招/已闭岗位 + 待审申请 + 待审薪资
    open_pos = await _get_json("/api/v1/work-study/positions", {"page": 1, "size": 1, "status": "open"}, ctx)
    closed_pos = await _get_json("/api/v1/work-study/positions", {"page": 1, "size": 1, "status": "closed"}, ctx)
    pending_apps = await _get_json("/api/v1/work-study/applications", {"page": 1, "size": 1, "status": "pending"}, ctx)
    pending_sal = await _get_json("/api/v1/work-study/salaries", {"page": 1, "size": 1, "status": "pending"}, ctx)
    return ws_p.t("DASHBOARD_STAFF_DEFAULT", lang).format(
        open=(open_pos.get('data') or {}).get('total') or 0,
        closed=(closed_pos.get('data') or {}).get('total') or 0,
        pending_apps=(pending_apps.get('data') or {}).get('total') or 0,
        pending_sal=(pending_sal.get('data') or {}).get('total') or 0,
    )


# ---------- query_late_students ----------

async def query_late_students(args: dict[str, Any], ctx: dict) -> str:
    days = int(args.get("days") or 7)
    limit = int(args.get("limit") or 10)
    body = await _get_json(
        "/api/v1/student-stats/top-late",
        {"days": days, "limit": limit},
        ctx,
    )
    rows = body.get("data") or []
    if not rows:
        return f"最近 {days} 天，辅导员管辖班级没有任何迟到记录。"
    total = sum(int(r.get("late_count") or 0) for r in rows)
    lines = [
        f"最近 {days} 天迟到次数 Top {len(rows)}（共 {total} 次迟到，{len(rows)} 位学生）："
    ]
    for r in rows:
        sid = r.get("student_id")
        sname = r.get("student_name") or f"#{sid}"
        cnt = r.get("late_count") or 0
        cid = r.get("class_id")
        lines.append(f"- {sname}（id={sid}，班级 {cid}）：{cnt} 次")
    lines.append("（如需进一步查看某位学生的完整事件，调用 query_student_events。）")
    return "\n".join(lines)


# ---------- resolve_date ----------
# Deterministic date-expression resolver. Previously chat.py asked the LLM to
# convert "明天/下周三" into YYYY-MM-DD itself, which broke on midnight, month
# rollovers, and UTC vs Asia/Shanghai drift. Pulling resolution into Python with
# the tenant timezone (Asia/Shanghai) is bulletproof; the LLM only identifies
# that an expression needs resolving.
async def resolve_date(args: dict[str, Any], ctx: dict) -> str:  # noqa: ARG001
    expr = (args.get("expression") or "").strip()
    if not expr:
        return "expression 不能为空。"

    tz = ZoneInfo("Asia/Shanghai")
    today: date_cls = datetime.now(tz).date()

    # ISO date pass-through (YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD)
    iso_match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", expr)
    if iso_match:
        try:
            d = date_cls(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))
            return f"{d.isoformat()}（{_weekday_zh(d)}）"
        except ValueError:
            return f"非法日期：{expr}"

    # MM月DD日 / MM-DD（默认今年；若已过则推到明年）
    md_match = re.match(r"^(\d{1,2})[月\-/.](\d{1,2})[日号]?$", expr)
    if md_match:
        m, d_ = int(md_match.group(1)), int(md_match.group(2))
        try:
            target = date_cls(today.year, m, d_)
        except ValueError:
            return f"非法日期：{expr}"
        if target < today:
            target = target.replace(year=today.year + 1)
        return f"{target.isoformat()}（{_weekday_zh(target)}）"

    # 关键字
    kw_table = {
        "今天": 0, "今日": 0, "今儿": 0,
        "明天": 1, "明日": 1, "明儿": 1,
        "后天": 2, "后日": 2,
        "大后天": 3,
        "昨天": -1, "昨日": -1,
        "前天": -2,
    }
    if expr in kw_table:
        d = today + timedelta(days=kw_table[expr])
        return f"{d.isoformat()}（{_weekday_zh(d)}）"

    # N 天后/前 / N 周后/前
    nd_match = re.match(r"^(\d+)\s*天\s*(后|前|之后|之前)$", expr)
    if nd_match:
        n = int(nd_match.group(1))
        sign = -1 if nd_match.group(2) in ("前", "之前") else 1
        d = today + timedelta(days=sign * n)
        return f"{d.isoformat()}（{_weekday_zh(d)}）"
    nw_match = re.match(r"^(\d+)\s*(周|星期)\s*(后|前|之后|之前)$", expr)
    if nw_match:
        n = int(nw_match.group(1))
        sign = -1 if nw_match.group(3) in ("前", "之前") else 1
        d = today + timedelta(days=sign * n * 7)
        return f"{d.isoformat()}（{_weekday_zh(d)}）"

    # 本/下/下下/上 周X
    weekday_map = {
        "一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6,
    }
    week_match = re.match(r"^(本|下|下下|上)?(?:周|星期)([一二三四五六日天])$", expr)
    if week_match:
        which = week_match.group(1) or "本"
        wd = weekday_map[week_match.group(2)]
        cur_monday = today - timedelta(days=today.weekday())
        offset = {"上": -7, "本": 0, "下": 7, "下下": 14}[which]
        d = cur_monday + timedelta(days=offset + wd)
        return f"{d.isoformat()}（{_weekday_zh(d)}）"

    # 月底 / 月初
    if expr in ("月底", "本月底"):
        if today.month == 12:
            d = date_cls(today.year, 12, 31)
        else:
            d = date_cls(today.year, today.month + 1, 1) - timedelta(days=1)
        return f"{d.isoformat()}（{_weekday_zh(d)}）"
    if expr in ("月初", "本月初"):
        d = today.replace(day=1)
        return f"{d.isoformat()}（{_weekday_zh(d)}）"

    return f"无法解析日期表达式：{expr}（支持：今天/明天/后天/N天后/下周一/月底/2026-04-30 等）"


def _weekday_zh(d: date_cls) -> str:
    return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][d.weekday()]


# ---------- leave types (cached) ----------
# chat.py used to hard-code the leave_type enum on `open_leave_form`. New
# leave types added in DB → AI keeps suggesting old codes → form rejects them.
# Fetch the live list with a short TTL cache so adding/disabling a type in DB
# is immediately reflected without a sidecar restart.
_LEAVE_TYPES_CACHE: list[dict[str, str]] | None = None
_LEAVE_TYPES_TS: float = 0.0
_LEAVE_TYPES_TTL = 300.0  # 5 minutes

_DEFAULT_LEAVE_TYPES: list[dict[str, str]] = [
    {"code": "sick_on_campus", "name": "病假（在校）"},
    {"code": "sick_off_campus", "name": "病假（离校）"},
    {"code": "personal", "name": "事假"},
    {"code": "weekend", "name": "周末离校"},
    {"code": "official", "name": "公假"},
]


async def fetch_leave_types() -> list[dict[str, str]]:
    """Return [{code, name}, ...] for enabled leave types. 5-min in-memory
    cache; falls back to a fixed default list when the backend is down so the
    AI agent keeps working."""
    import time as _time
    global _LEAVE_TYPES_CACHE, _LEAVE_TYPES_TS
    now = _time.time()
    if _LEAVE_TYPES_CACHE is not None and (now - _LEAVE_TYPES_TS) < _LEAVE_TYPES_TTL:
        return _LEAVE_TYPES_CACHE
    try:
        async with httpx.AsyncClient(
            base_url=settings.java_base_url, timeout=5.0, trust_env=False
        ) as c:
            # Endpoint is open (no auth header required for the catalog read).
            resp = await c.get("/api/v1/leave-types")
            resp.raise_for_status()
            data = resp.json().get("data") or []
            types = [
                {"code": x.get("code"), "name": x.get("name")}
                for x in data
                if x.get("enabled", True) and x.get("code") and x.get("name")
            ]
        if types:
            _LEAVE_TYPES_CACHE = types
            _LEAVE_TYPES_TS = now
            return types
    except Exception:
        logger.warning("fetch_leave_types failed; using defaults", exc_info=True)
    return _LEAVE_TYPES_CACHE or _DEFAULT_LEAVE_TYPES


# ---------- field catalog (cached) ----------
# 后端 yaml field-catalog 的镜像。一份 yaml 驱动:后端 SqlBuilder + 这里 AI 工具 input_schema +
# 前端 chip 渲染。原来 filter_students 的 schema 9 处硬编码现在全靠这个动态拉。
# 5 分钟 TTL,catalog 几乎不变;后端起不来时 fallback 到 None,_build_tools 那头会跳过 schema 注入。
_FIELD_CATALOG_CACHE: dict[str, dict] = {}
_FIELD_CATALOG_TS: dict[str, float] = {}
_FIELD_CATALOG_TTL = 300.0


async def fetch_field_catalog(page: str) -> dict | None:
    """读后端 /internal/field-catalog/{page}。返回 {page, fields:[...]} 或 None。
    sidecar 走 /internal 前缀,SaToken 白名单已放行,不需带 user 头。"""
    import time as _time
    now = _time.time()
    cached = _FIELD_CATALOG_CACHE.get(page)
    ts = _FIELD_CATALOG_TS.get(page, 0.0)
    if cached is not None and (now - ts) < _FIELD_CATALOG_TTL:
        return cached
    try:
        async with httpx.AsyncClient(
            base_url=settings.java_base_url, timeout=5.0, trust_env=False
        ) as c:
            resp = await c.get(f"/internal/field-catalog/{page}")
            resp.raise_for_status()
            data = resp.json().get("data") or {}
        if data and data.get("fields"):
            _FIELD_CATALOG_CACHE[page] = data
            _FIELD_CATALOG_TS[page] = now
            return data
    except Exception:
        logger.warning("fetch_field_catalog(%s) failed", page, exc_info=True)
    return cached  # 拉失败时:有过缓存就用旧的;否则 None,调用方自己降级


# ---------- Registry ----------

Handler = Callable[[dict[str, Any], dict], Awaitable[str]]

TOOLS: list[dict[str, Any]] = [
    {
        "name": "query_leaves",
        "description": (
            "查询请假记录。"
            "scope=my 查当前学生自己的请假；"
            "scope=class 查当前辅导员管辖班级请假（可选 status 筛选）；"
            "scope=student 查当前辅导员管辖班级中【指定学生】的请假（必须传 student_id，可选 months 限定窗口）——"
            "当用户指代具体某位学生（refs 中有 student 对象，或用户明确报了学号/姓名）时优先用这个；"
            "scope=uncancelled 查未销假学生名单。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["my", "class", "student", "uncancelled"],
                    "description": "my=学生本人；class=辅导员班级；student=辅导员班级中某位学生；uncancelled=未销假名单",
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "approved", "rejected", "cancelled"],
                    "description": "状态过滤（可选），仅对 my/class/student 生效",
                },
                "student_id": {
                    "type": "integer",
                    "description": "学生 ID，scope=student 时必填（对应 refs 中 student 对象的 id）",
                },
                "months": {
                    "type": "integer",
                    "description": "时间窗口（月），scope=student 时可选，默认不限",
                },
            },
            "required": ["scope"],
        },
        "allowed_roles": {
            "my": {"student"},
            "class": {"counselor", "dean", "school_admin"},
            "student": {"counselor", "dean", "school_admin"},
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
                    "enum": ["leaves", "checkins", "collections"],
                    "description": "统计指标：leaves=请假；checkins=签到活动；collections=信息收集单",
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
        "description": (
            "查询学生违纪与处分记录。scope=recent 看近期违纪；scope=student 传 student_id 看指定学生的违纪+处分；"
            "scope=pending_approval 看待审批队列（dean/admin 用来回答「有几条待审批」「有哪些学生的违纪还没批」）。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["recent", "student", "pending_approval"],
                    "description": "recent=近期所有；student=指定学生；pending_approval=待审批队列",
                },
                "student_id": {"type": "integer", "description": "学生 ID，scope=student 必填"},
                "category": {"type": "string", "description": "违纪类别（可选，scope=recent 生效）"},
            },
            "required": ["scope"],
        },
        "allowed_roles": {
            "recent": {"counselor", "dean", "school_admin"},
            "student": {"counselor", "dean", "school_admin"},
            "pending_approval": {"dean", "school_admin"},
        },
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
        "name": "find_workstudy_positions_by_preference",
        "description": (
            "学生侧·按自然语言偏好筛选勤工助学岗位。"
            "把学生说的「想找周二下午图书馆/不低于 15/学一区那种」拆成 keyword + min_rate + campus 等结构化参数后调用，"
            "后端会自动叠加资格预筛（性别/年级/学院/困难等级/在岗上限）。"
            "比 query_work_study(positions) 更聪明：直接给出符合学生条件的可申请岗位。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "关键词，匹配 title/描述/部门/校区/工作地点（可选）"},
                "position_type": {"type": "string", "enum": ["fixed", "temporary"], "description": "岗位类型：fixed=固定岗 / temporary=临时岗（可选）"},
                "min_rate": {"type": "number", "description": "薪资下限（按 salary_amount 或旧 hourly_rate 比较，可选）"},
                "campus": {"type": "string", "description": "校区（可选，模糊匹配）"},
            },
        },
        "allowed_roles": {None: {"student"}},
    },
    {
        "name": "match_workstudy_positions_to_schedule",
        "description": (
            "学生侧·按空余时间自动匹配勤工助学岗位。"
            "把学生口述的空余时间拆成 free_slots: [{day:'mon',start:'14:00',end:'17:00'}]，"
            "后端拉所有可申请岗位、用 time_slots 字段计算覆盖率排序输出。无时间要求的岗位排中间。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "free_slots": {
                    "type": "array",
                    "description": "空余时间段列表",
                    "items": {
                        "type": "object",
                        "properties": {
                            "day": {"type": "string", "enum": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
                            "start": {"type": "string", "description": "HH:MM 24h"},
                            "end": {"type": "string", "description": "HH:MM 24h"},
                        },
                        "required": ["day", "start", "end"],
                    },
                },
            },
            "required": ["free_slots"],
        },
        "allowed_roles": {None: {"student"}},
    },
    {
        "name": "draft_workstudy_application_intro",
        "description": (
            "学生侧·基于岗位详情自动生成申请理由草稿（200-300 字）。"
            "草稿基于岗位 title/描述/要求/校区/时间段拼成，方括号【】部分由学生补充。"
            "可选传 student_brief（学生本人简介，用于个性化片段）。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "position_id": {"type": "integer", "description": "岗位 ID"},
                "student_brief": {
                    "type": "string",
                    "description": '学生自我简介（可选，如"软件工程 2023 级学生，有图书馆志愿者经验"）',
                },
            },
            "required": ["position_id"],
        },
        "allowed_roles": {None: {"student"}},
    },
    {
        "name": "detect_workstudy_salary_anomaly",
        "description": (
            "资助中心侧·扫描指定月份的薪资申报，对比该岗位历史均值，标出金额超过 ×threshold_factor 的异常。"
            "用于资助中心批量审批前的预警。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "string", "description": "yyyy-MM；不传 = 全部月份"},
                "threshold_factor": {
                    "type": "number",
                    "description": "倍数阈值（默认 1.5，即 amount > 历史均值×1.5 即标记）",
                },
            },
        },
        "allowed_roles": {None: {"aid_center_officer", "student_affairs_officer", "school_admin"}},
    },
    {
        "name": "suggest_workstudy_position_template",
        "description": (
            "用工/学工侧·基于历史岗位（可按 employer 过滤）汇总主流类型/单位/均薪/工时等，给出新岗位发布的模板建议。"
            '适合"同步上一学年""新单位首次发布"两个场景。'
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "employer_id": {"type": "integer", "description": "用人单位 ID（可选，不传 = 跨单位汇总）"},
            },
        },
        "allowed_roles": {None: {"counselor", "dean", "student_affairs_officer", "school_admin"}},
    },
    {
        "name": "workstudy_dashboard_brief",
        "description": (
            "勤工助学仪表板播报。按 ctx.user_role 自动切换口径："
            "学生看可申请岗位+我的申请进度；资助中心看待审批薪资+异常提示；用工/学工看在招/待审/待结算总览。"
            '用 3-5 句话回答"今天勤工助学这边怎么样"。'
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "role": {
                    "type": "string",
                    "enum": ["student", "aid_center_officer", "counselor", "dean", "student_affairs_officer", "school_admin"],
                    "description": "可选；不传则按当前用户角色",
                },
            },
        },
        "allowed_roles": None,    # 全部角色
    },
    {
        "name": "summarize_workstudy_applicants",
        "description": (
            "用工单位/岗位负责人/学工处侧·把某岗位的所有申请压成对比卡。"
            "返回审批中/已录用/已拒绝计数 + 审批中候选人的姓名/困难等级/申请理由摘要，方便岗位负责人快速决策。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "position_id": {"type": "integer", "description": "岗位 ID"},
            },
            "required": ["position_id"],
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin", "student_affairs_officer"}},
    },
    {
        "name": "query_student_events",
        "description": (
            "查询一批学生的近期行为事件（缺课/迟到/请假/违纪/诉求/通知确认等）。"
            "当用户问「这些学生最近表现怎么样」「有没有缺课」「最近有什么异常」时调用。"
            "students 参数传 [{id, name}] 的列表（id 必填，name 用于回复中引用）；days 是查询窗口（默认 30 天）。"
            "辅导员/管理员专用。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "students": {
                    "type": "array",
                    "description": "要查询的学生列表，每项 {id, name}。id 从右侧面板 pinned refs 或上一轮查询拿到。",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer", "description": "学生 user_id"},
                            "name": {"type": "string", "description": "学生姓名（可选，用于回复中引用）"},
                        },
                        "required": ["id"],
                    },
                },
                "days": {
                    "type": "integer",
                    "description": "查询窗口（天），默认 30",
                },
            },
            "required": ["students"],
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "query_late_students",
        "description": (
            "查询辅导员管辖班级里迟到次数最多的学生（Top N，含真实 student_id 与姓名）。"
            "当 AI 观察员或辅导员需要说出「迟到率较高的 N 名学生具体是谁」时必须调用此工具，"
            "不要根据总迟到事件数自行推断学生人数。返回每位学生的 id、姓名、班级、近 N 天迟到次数。"
            "辅导员/管理员专用。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "统计窗口（天），默认 7，最大 90",
                },
                "limit": {
                    "type": "integer",
                    "description": "返回的学生数量上限，默认 10，最大 50",
                },
            },
        },
        "allowed_roles": {None: {"counselor", "dean", "school_admin"}},
    },
    {
        "name": "resolve_date",
        "description": (
            "把中文日期表达式解析成 YYYY-MM-DD（按 Asia/Shanghai 时区）。"
            "**当用户提到任何相对日期（今天/明天/后天/N天后/下周一/月底/5月1日 等）"
            "且你需要把它写成 ISO 日期填到表单时，必须先调用此工具，**"
            "不要自己心算。支持表达：今天/明天/后天/大后天/前天/昨天、N 天前后、N 周前后、"
            "本周X/下周X/上周X、月初/月底、MM月DD日、YYYY-MM-DD。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "原文日期表达式，如 \"明天\" / \"下周三\" / \"5月1日\" / \"3天后\"",
                },
            },
            "required": ["expression"],
        },
        "allowed_roles": None,  # all roles
    },
    {
        "name": "read_workflow_config_summary",
        "description": (
            "读当前发布的请假/销假规则的中文摘要。"
            "当老师/管理员问「事假规则是什么」「请假最长几天」「销假怎么走」"
            "「现在是什么配置」等查询类问题时调用。返回中文 Markdown 文本,"
            "包含假别 + 各档审批人 + 表单字段。"
            "**只读**,不改任何配置。"
            "若老师明确说要改配置,改用 propose_workflow_config_change UI tool。"
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
                    "description": "学院 override id;不指定则全校默认。",
                },
            },
            "required": ["biz_type"],
        },
        "allowed_roles": None,  # 所有角色都能读规则
    },
]

async def _read_workflow_config_summary(args: dict[str, Any], ctx: dict) -> str:
    """读 backend GET /api/v1/workflow-config/summary,返回中文 markdown。
    替代旧的 audit_leave_config / get_default_leave_config / explain_base_diff
    等老 query tool —— 它们都调已删除的 /api/v1/leave-config/* endpoints。
    """
    biz_type = args.get("biz_type") or "leave"
    college_id = args.get("college_id")
    params: dict[str, str] = {"biz_type": biz_type}
    if college_id is not None:
        params["college_id"] = str(college_id)
    headers = {
        "X-User-Id": ctx.get("user_id") or "0",
        "X-Tenant-Id": ctx.get("tenant_id") or "default",
        "X-User-Role": ctx.get("user_role") or "student",
    }
    try:
        async with _client() as c:
            r = await c.get("/api/v1/workflow-config/summary", headers=headers, params=params)
            r.raise_for_status()
            data = (r.json() or {}).get("data") or {}
    except Exception as e:
        return f"读取配置摘要失败:{e}"
    if data.get("version") is None:
        return f"({biz_type} 还没发布过配置)"
    return (
        f"# {data.get('name')} (v{data.get('version')})\n\n"
        + (data.get("summary_md") or "")
    )


HANDLERS: dict[str, Handler] = {
    "read_workflow_config_summary": _read_workflow_config_summary,
    "query_leaves": query_leaves,
    "query_notifications": query_notifications,
    "query_checkins": query_checkins,
    "query_collections": query_collections,
    "query_stats": query_stats,
    "query_work_logs": query_work_logs,
    "query_violations": query_violations,
    "query_work_study": query_work_study,
    "find_workstudy_positions_by_preference": find_workstudy_positions_by_preference,
    "match_workstudy_positions_to_schedule": match_workstudy_positions_to_schedule,
    "summarize_workstudy_applicants": summarize_workstudy_applicants,
    "draft_workstudy_application_intro": draft_workstudy_application_intro,
    "detect_workstudy_salary_anomaly": detect_workstudy_salary_anomaly,
    "suggest_workstudy_position_template": suggest_workstudy_position_template,
    "workstudy_dashboard_brief": workstudy_dashboard_brief,
    "query_student_events": query_student_events,
    "query_late_students": query_late_students,
    "resolve_date": resolve_date,
}


def _split_roles(role: str | None) -> set[str]:
    """Real users can hold multiple roles (e.g. counselor + school_admin).
    The sidecar receives them comma-separated in X-User-Role; treat any
    matching code as authorized."""
    if not role:
        return set()
    return {r.strip() for r in role.split(",") if r.strip()}


def is_role_allowed(tool: dict, args: dict, role: str) -> bool:
    """Whether `role` (comma-separated codes) may call `tool` with the given args.

    `allowed_roles` shapes:
      - None            → all roles
      - {scope_value: {role...}}  → per-scope gating, using args["scope"]
      - {None: {role...}}         → tool-wide role whitelist (scope-free tool)
    """
    rules = tool.get("allowed_roles")
    if rules is None:
        return True
    user_roles = _split_roles(role)
    if None in rules:
        return bool(user_roles & rules[None])
    scope = (args or {}).get("scope")
    allowed = rules.get(scope)
    return bool(allowed and (user_roles & allowed))


def tools_for_role(role: str) -> list[dict[str, Any]]:
    """Return tool definitions visible to `role`. Scope-gated tools are kept
    in the list as-is; per-call gating happens in `is_role_allowed` at dispatch."""
    user_roles = _split_roles(role)
    out = []
    for t in TOOLS:
        rules = t.get("allowed_roles")
        if rules is None:
            out.append(t)
        elif None in rules:
            if user_roles & rules[None]:
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
    user_lang: str = "zh",
) -> str:
    handler = HANDLERS.get(tool_name)
    if handler is None:
        return f"未知查询工具：{tool_name}"

    tool_def = next((t for t in TOOLS if t["name"] == tool_name), None)
    if tool_def and not is_role_allowed(tool_def, args or {}, user_role or "student"):
        return "当前角色无权调用此查询。"

    ctx = {
        "user_id": user_id, "tenant_id": tenant_id,
        "user_role": user_role, "user_lang": user_lang,
    }
    try:
        return await handler(args or {}, ctx)
    except httpx.HTTPStatusError as e:
        logger.warning("query tool %s HTTP %s: %s", tool_name, e.response.status_code, e.response.text[:200])
        return f"查询失败（HTTP {e.response.status_code}）"
    except Exception:
        logger.exception("query tool %s failed", tool_name)
        return "查询失败，请稍后重试。"
