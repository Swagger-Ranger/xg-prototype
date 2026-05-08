"""User-facing copy for the work-study AI tools.

Centralised here so admins can tweak phrasing (语气/称谓/落款/语种) without
diving into tool logic. Templates use Python str.format with named placeholders.

Lookup is via ``t(key, lang='zh')``. ``lang='en'`` falls back to ``zh`` when an
EN translation is missing — never raises so we never block on missing locales.

Editing rules:
- Keep placeholders like {field} unchanged or all tools using them break.
- Don't add new placeholders without updating the calling tool too.
- Whitespace/newlines matter for chat rendering; keep structure intact.
"""
from __future__ import annotations


# ─── default Chinese strings (legacy module-level access still works) ─

# draft_workstudy_application_intro
DRAFT_OPENING = "尊敬的{dept}负责老师：\n您好，我希望申请《{title}》{ptype_suffix}。"
DRAFT_AID_PLEDGE = "我属于{aid_label}学生，希望通过这份岗位减轻经济压力，同时锻炼能力。"
DRAFT_REQUIREMENTS_SECTION = (
    "我注意到岗位要求：{requirements} "
    "我相信我可以胜任，原因是【请在此补充 1-2 句你的相关经验或兴趣】。"
)
DRAFT_DESCRIPTION_FALLBACK = (
    "对于本岗位的工作内容（{description}），"
    "我有较强的意愿与责任心。"
)
DRAFT_LOCATION = "我目前在{loc}附近活动，到岗便利。"
DRAFT_TIME_PLEDGE = "我能稳定到岗 {readable}，可保证时段内不缺席。"
DRAFT_CLOSING = "如有机会进入岗位，我会按时完成任务、维护单位形象，期待您的回复。谢谢！"
DRAFT_WRAPPER = (
    "📝 申请理由草稿（请按需修改后提交）：\n\n"
    "{draft}\n\n"
    "—— 草稿结束。注意：方括号【】中的部分需要你自己补充；"
    '如需更口语化或更书面化，告诉我"用更口语/书面的语气重写"。'
)

# workstudy_dashboard_brief
DASHBOARD_STUDENT = (
    "当前学校共 {open_total} 个你能申请的在招岗位。"
    "你已提交申请 {submitted} 份，其中审批中 {pending}、已录用 {hired}。"
)
DASHBOARD_STUDENT_NO_APPS_HINT = (
    '\n建议：尚未申请请按"按偏好/按时间"两个 AI 工具找一个匹配度最高的。'
)
DASHBOARD_AID_CENTER = "待审批薪资 {pending} 条，已确认 {confirmed} 条。"
DASHBOARD_AID_CENTER_HINT = (
    "\n建议：先调用 detect_workstudy_salary_anomaly 扫一遍异常，再批量审批。"
)
DASHBOARD_STAFF_DEFAULT = (
    "在招岗位 {open} 个，已关闭 {closed} 个。\n"
    "待审批申请 {pending_apps} 条，待审批薪资 {pending_sal} 条。\n"
    "建议：申请超过 5 条时先用 summarize_workstudy_applicants(position_id) 看候选对比卡再批。"
)

# find_workstudy_positions_by_preference
FIND_NO_RESULTS = (
    "目前没有符合你条件且你还能申请的在招岗位（已过滤性别/年级/学院/困难等级/在岗上限）。"
)
FIND_NONE_AFTER_FILTER = (
    "在 {total} 个你能申请的岗位里，没有同时满足 keyword/rate/campus 条件的。可以放宽条件再试。"
)
FIND_HEADER = "找到 {n} 个匹配岗位（最多展示 8 个）："
FIND_ITEM = (
    "- #{pid} {title}（{dept}，{ptype}岗），¥{rate}/{unit}，"
    "已招 {hired}/{headcount}，校区：{campus}"
)
FIND_FOOTER = "（如要进一步看时间是否冲突，调用 match_workstudy_positions_to_schedule。）"

# match_workstudy_positions_to_schedule
MATCH_NEED_SLOTS = "需要提供 free_slots，例如 [{day:'mon', start:'14:00', end:'17:00'}]"
MATCH_NO_OPEN_POSITIONS = "目前没有你能申请的在招岗位。"
MATCH_HEADER = "共 {n} 个候选岗位，按时间覆盖度排序（最多展示 8 个）："
MATCH_ITEM = "- #{pid} {title}（{dept}）：{ratio_label}"
MATCH_RATIO_NO_REQUIREMENT = "无时间要求"
MATCH_RATIO_FORMAT = "覆盖 {pct}%（{h}h{m}m）"

# summarize_workstudy_applicants
SUMMARIZE_NO_DATA = "岗位 #{pid} 暂无申请。"
SUMMARIZE_HEADER = (
    "岗位 #{pid} 申请总览：共 {total} 份"
    "（审批中 {pending} / 已录用 {hired} / 已拒绝 {rejected}）。"
)
SUMMARIZE_PENDING_TITLE = "审批中候选对比卡："
SUMMARIZE_NO_PENDING = "当前没有审批中的申请。"
SUMMARIZE_ITEM = (
    "- 申请 #{aid} {sname}，困难等级：{aid_label}，提交于 {date}\n  申请理由：{intro}"
)
SUMMARIZE_TRUNCATED = "……还有 {n} 份审批中申请未列出。"
APPLICANT_AID_LABEL = {
    "special": "特别困难", "difficult": "困难", "mild": "一般困难", "none": "不困难",
}

# detect_workstudy_salary_anomaly
ANOMALY_NO_DATA = "{month}没有薪资申报记录。"
ANOMALY_NONE = "已扫描 {n} 条薪资（{month}），未发现金额超过历史均值 ×{factor} 的异常。"
ANOMALY_HEADER = "⚠️ 发现 {n} 条疑似异常薪资（金额 > 历史均值 ×{factor}），按超出倍数排序："
ANOMALY_ITEM = (
    "- 薪资 #{sid} 学生 #{stu} 岗位 #{pid} {month}：¥{amt}"
    "（基线 ¥{avg}，{ratio}×），状态 {status_label}"
)
ANOMALY_TRUNCATED = "…还有 {n} 条异常未列出。"

# suggest_workstudy_position_template
SUGGEST_NO_HISTORY = "没有历史岗位可供参考。"
SUGGEST_HEADER = "基于 {n} 个历史岗位{employer_suffix}，建议新岗位模板："
SUGGEST_BODY = (
    "- 类型：{type_label}（历史占比最高）\n"
    "- 薪资：¥{rate_avg} / {unit_label}（{rate_n} 条样本均值）\n"
    "- 周工时：{weekly_med} 小时（中位数）\n"
    "- 招聘人数：{headcount_med} 人（中位数）\n"
    "- 主校区：{campus_top}\n"
    "（具体描述/任职要求/设岗理由仍需用工单位补充。）"
)

# helpers
AID_LABEL = {
    "special": "家庭经济特别困难",
    "difficult": "家庭经济困难",
    "mild": "家庭经济一般困难",
}
DAY_LABEL = {
    "mon": "周一", "tue": "周二", "wed": "周三", "thu": "周四",
    "fri": "周五", "sat": "周六", "sun": "周日",
}


# ─── English translations ────────────────────────────────────────────

EN: dict[str, object] = {
    # draft
    "DRAFT_OPENING": "Dear {dept} hiring team:\nI'd like to apply for the position of \"{title}\" {ptype_suffix}.",
    "DRAFT_AID_PLEDGE": "I am classified as a {aid_label} student, hoping this position will ease financial pressure while building my skills.",
    "DRAFT_REQUIREMENTS_SECTION": (
        "I noticed the requirements: {requirements} "
        "I believe I am qualified because [please add 1-2 sentences on relevant experience or interest]."
    ),
    "DRAFT_DESCRIPTION_FALLBACK": (
        "Regarding the work content ({description}), "
        "I have strong motivation and a sense of responsibility."
    ),
    "DRAFT_LOCATION": "I am currently active around {loc}, making attendance convenient.",
    "DRAFT_TIME_PLEDGE": "I can reliably attend during {readable} without absence.",
    "DRAFT_CLOSING": "If selected, I will complete tasks on time and uphold the unit's reputation. Looking forward to your reply. Thank you!",
    "DRAFT_WRAPPER": (
        "📝 Application draft (please edit before submitting):\n\n"
        "{draft}\n\n"
        "—— End of draft. Note: text in brackets [] is for you to fill in; "
        'tell me "rewrite in a more casual / formal tone" to adjust style.'
    ),

    # dashboard
    "DASHBOARD_STUDENT": (
        "There are {open_total} positions you can apply to right now. "
        "You have submitted {submitted} applications: {pending} pending, {hired} hired."
    ),
    "DASHBOARD_STUDENT_NO_APPS_HINT": (
        "\nTip: try \"find by preference\" or \"match by schedule\" to pick a best match."
    ),
    "DASHBOARD_AID_CENTER": "{pending} salary submissions awaiting approval, {confirmed} already confirmed.",
    "DASHBOARD_AID_CENTER_HINT": (
        "\nTip: run detect_workstudy_salary_anomaly first, then batch-approve the rest."
    ),
    "DASHBOARD_STAFF_DEFAULT": (
        "Open positions: {open}, closed: {closed}.\n"
        "Pending applications: {pending_apps}, pending salaries: {pending_sal}.\n"
        "Tip: when an application has 5+ candidates, run summarize_workstudy_applicants(position_id) first."
    ),

    # find
    "FIND_NO_RESULTS": "No open positions match your eligibility (filtered by gender / grade / college / aid level / current cap).",
    "FIND_NONE_AFTER_FILTER": "Of the {total} positions you're eligible for, none also matched keyword/rate/campus. Try relaxing criteria.",
    "FIND_HEADER": "{n} matching positions (showing up to 8):",
    "FIND_ITEM": "- #{pid} {title} ({dept}, {ptype}), ¥{rate}/{unit}, hired {hired}/{headcount}, campus: {campus}",
    "FIND_FOOTER": "(To check for time conflicts, use match_workstudy_positions_to_schedule.)",

    # match
    "MATCH_NEED_SLOTS": "free_slots is required, e.g. [{day:'mon', start:'14:00', end:'17:00'}]",
    "MATCH_NO_OPEN_POSITIONS": "No open positions you can apply to.",
    "MATCH_HEADER": "{n} candidate positions, sorted by schedule coverage (showing up to 8):",
    "MATCH_ITEM": "- #{pid} {title} ({dept}): {ratio_label}",
    "MATCH_RATIO_NO_REQUIREMENT": "no time requirement",
    "MATCH_RATIO_FORMAT": "covers {pct}% ({h}h{m}m)",

    # summarize
    "SUMMARIZE_NO_DATA": "Position #{pid} has no applications yet.",
    "SUMMARIZE_HEADER": (
        "Position #{pid} applications: {total} total "
        "(pending {pending} / hired {hired} / rejected {rejected})."
    ),
    "SUMMARIZE_PENDING_TITLE": "Pending candidates:",
    "SUMMARIZE_NO_PENDING": "No pending applications.",
    "SUMMARIZE_ITEM": "- #{aid} {sname}, aid level: {aid_label}, submitted {date}\n  Reason: {intro}",
    "SUMMARIZE_TRUNCATED": "...{n} more pending applications not shown.",
    "APPLICANT_AID_LABEL": {
        "special": "extra-difficult", "difficult": "difficult",
        "mild": "mild", "none": "not difficult",
    },

    # anomaly
    "ANOMALY_NO_DATA": "No salary submissions for {month}.",
    "ANOMALY_NONE": "Scanned {n} salaries ({month}), no amounts exceed historical mean × {factor}.",
    "ANOMALY_HEADER": "⚠️ {n} suspicious salaries (amount > mean × {factor}), sorted by ratio:",
    "ANOMALY_ITEM": (
        "- salary #{sid} student #{stu} position #{pid} {month}: ¥{amt}"
        " (baseline ¥{avg}, {ratio}×), status {status_label}"
    ),
    "ANOMALY_TRUNCATED": "...{n} more anomalies not shown.",

    # suggest
    "SUGGEST_NO_HISTORY": "No historical positions available for reference.",
    "SUGGEST_HEADER": "Based on {n} historical positions{employer_suffix}, suggested template:",
    "SUGGEST_BODY": (
        "- type: {type_label} (most common)\n"
        "- pay: ¥{rate_avg} / {unit_label} (mean over {rate_n} samples)\n"
        "- weekly hours: {weekly_med} h (median)\n"
        "- headcount: {headcount_med} (median)\n"
        "- main campus: {campus_top}\n"
        "(Description / requirements / reason still need to be filled by the employer.)"
    ),

    "AID_LABEL": {
        "special": "extra-difficult financial", "difficult": "financially difficult",
        "mild": "mildly financially difficult",
    },
    "DAY_LABEL": {
        "mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu",
        "fri": "Fri", "sat": "Sat", "sun": "Sun",
    },
}


def t(key: str, lang: str = "zh"):
    """Look up a template by key and language. Falls back to zh if EN missing."""
    if lang == "en" and key in EN:
        return EN[key]
    return globals().get(key, "")
