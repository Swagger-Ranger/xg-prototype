"""通知中心配置 — 自然语言改 endpoint。

老师在左侧 AI 助手说「把请假驳回通知关掉」,流程跟 workflow_config 一致:

  1) sidecar /chat LLM 检测意图 → emit UI tool
     `propose_notification_config_change(instruction)`
  2) AIPanel 收到 action → POST 本 endpoint /notification-config/propose
     - 本 endpoint 调 backend 拉当前模板 + 偏好 snapshot
     - LLM 输出**结构化 op pipeline**(不重写整个表)
     - 返回 {ops, diff_zh, ai_message}
  3) AIPanel 渲染中文 diff 卡 + [确认应用]按钮
  4) 老师确认 → AIPanel 调 backend POST /api/v1/notification-center/apply-ops

为何用结构化 op:5 类操作精确可枚举,LLM 出错率低,Java 端 apply 用既有
update / upsert,不引入新概念。
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.config import settings
from app.llm.deepseek import DeepSeekProvider

router = APIRouter(prefix="/notification-config", tags=["notification-config"])
logger = logging.getLogger(__name__)


CHANNEL_LABELS = {"in_app": "站内通知", "miniprogram": "小程序", "wecom": "企业微信"}
LEVEL_LABELS = {"normal": "一般", "important": "重要", "urgent": "紧急"}
ROLE_ZH = {
    "student": "学生",
    "class_monitor": "班长",
    "class_master": "班主任",
    "counselor": "辅导员",
    "college_secretary": "院系秘书",
    "dean": "院长",
    "student_affairs_officer": "学工科员",
    "student_affairs_director": "学工部长",
    "school_admin": "校管理员",
}
RECIPIENT_ZH = {
    "applicant": "申请人",
    "current_approver": "当前审批人",
    "applicant_counselor": "申请人辅导员",
    "applicant_class_master": "申请人班主任",
    "applicant_class_monitor": "申请人班长",
    "applicant_dean": "申请人院系负责人",
    "static_user": "指定用户",
}


SYSTEM_PROMPT = """你是通知中心配置助手。把校管理员的自然语言指令翻译成 op pipeline。

# 你能做的 6 种 op

```json
[
  {"op": "set_template_enabled", "code": "<TEMPLATE_CODE>", "enabled": true|false},
  {"op": "set_template_channels", "code": "<TEMPLATE_CODE>", "channels": ["in_app","miniprogram","wecom"]},
  {"op": "set_template_level",    "code": "<TEMPLATE_CODE>", "level": "normal|important|urgent"},
  {"op": "set_template_text",     "code": "<TEMPLATE_CODE>", "title": "...", "body": "..."},
  {"op": "set_template_recipients","code": "<TEMPLATE_CODE>",
                                   "recipients": [{"type":"applicant"},
                                                  {"type":"applicant_counselor","cc":true}]},
  {"op": "set_pref_channels",     "scope_type": "role", "scope_value": "<ROLE_CODE>",
                                   "template_code": "<TEMPLATE_CODE>",
                                   "channels": ["in_app", ...],
                                   "muted": false}
]
```

# 字段约束

- channel:只能是 in_app / miniprogram / wecom
- level:只能是 normal / important / urgent
- role_code:只能是 student / class_monitor / class_master / counselor / college_secretary / dean / student_affairs_officer / student_affairs_director / school_admin
- recipient.type:只能是 applicant(申请人) / current_approver(当前审批人) /
  applicant_counselor(申请人辅导员) / applicant_class_master(班主任) /
  applicant_class_monitor(班长) / applicant_dean(院系负责人) / static_user(指定用户,需带 user_id)
- recipient.cc:布尔,true 表示抄送(主收件人不填或填 false)
- TEMPLATE_CODE:必须是「当前模板列表」给的 code,不要瞎编

# 输出格式(严格 JSON,不要 markdown 包裹)

```json
{
  "ops": [...],
  "diff_zh": "中文 diff 摘要(用 - 开头每行 1 条)",
  "ai_message": "给老师看的总结(1-3 句话)"
}
```

# 示例

老师:「把请假驳回通知关掉」
→ ops: [{"op":"set_template_enabled","code":"LEAVE_REJECTED","enabled":false}]
→ diff_zh: "- 关闭「请假申请被驳回」通知"
→ ai_message: "好的,已关闭请假被驳回通知。学生不再收到此类通知。"

老师:「学生超时未销假改成只发企业微信」
→ ops: [{"op":"set_template_channels","code":"REMINDER_OVERDUE","channels":["wecom"]}]
→ diff_zh: "- 「请假超时未销假」渠道改为:企业微信(原:站内通知 / 小程序 / 企业微信)"
→ ai_message: "已把学生超时通知的渠道改成只发企业微信。"

老师:「辅导员的任务到达通知不要走小程序」
→ ops: [{"op":"set_pref_channels","scope_type":"role","scope_value":"counselor",
        "template_code":"LEAVE_APPROVAL_PENDING","channels":["in_app","wecom"],"muted":false}]
→ diff_zh: "- 辅导员收到「待审批到达」时只走:站内通知 / 企业微信"
→ ai_message: "已把辅导员的任务到达通知改成站内 + 企业微信,不再发小程序。"

老师:「请假通过通知抄送辅导员」
→ ops: [{"op":"set_template_recipients","code":"WORKFLOW_APPROVED",
        "recipients":[{"type":"applicant"},{"type":"applicant_counselor","cc":true}]}]
→ diff_zh: "- 「审批通过」通知收件人改为:申请人,抄送 申请人辅导员"
→ ai_message: "已把审批通过通知抄送给申请人辅导员。"

老师:「超时未销假不要再发给辅导员了」
→ ops: [{"op":"set_template_recipients","code":"REMINDER_OVERDUE",
        "recipients":[{"type":"applicant"}]}]
→ diff_zh: "- 「请假超时未销假」收件人改为:申请人(原:申请人 + 抄送辅导员)"
→ ai_message: "已把超时未销假通知改成只发学生本人,不再抄送辅导员。"

# 铁律 — 通知模板只能改不能新增

通知模板 = 业务事件处理器(请假到期 / 节点到达 / 审批结束 等),**不能凭空新建**——新增模板
要先注册业务事件源,这是研发层面的事,不在 AI 配置改动范围内。

用户说"新建 / 新增 / 帮我建一条 X 通知 / create / 加一个 X 提醒"时,**严禁找最相近模板凑数**。
也**严禁**自己编造 op_type 之外的字段或假装能做。

正确响应:ops=[],ai_message 用以下模板回答(把 {场景} 替换成用户原话里的具体描述):
"通知模板是业务事件处理器(系统在某事件发生时才会发的消息壳子),只能调整既有模板的
 启停 / 渠道 / 收件人 / 级别 / 文案,无法凭空新建。系统目前没有对应『{场景}』的业务事件源,
 因此无法新建该模板。如果你想要的是一次性广播(到点群发),P0 暂未实现该功能。
 既有模板列表见左侧『通知中心配置』。"

# 反问规则

- 用户只说「改通知」/「改规则」(没具体目标)→ ops=[],ai_message 反问"想改哪个通知?"
- 老师说的目标在「当前模板列表」里找不到对应 code,且**不是新建意图** → ops=[],ai_message
  列出 3-5 个最相近的模板请老师选
- 新建意图(见上面铁律)→ 严禁列"最相近模板",必须明确告知"无法新建"

不要产生「当前模板列表」之外的 code。
"""


class ProposeReq(BaseModel):
    instruction: str


class ProposeResp(BaseModel):
    ok: bool
    ops: list[dict] | None = None
    diff_zh: str | None = None
    ai_message: str
    error_code: str | None = None
    # 改动语义分类(deterministic,基于 ops 推出)。前端在通知提案卡顶部高亮,
    # 防止 AI 把"关掉通知"理解成"只关某个渠道"等误读未被察觉就点了确认。
    change_category: str | None = None
    change_category_label: str | None = None


_NOTIF_OP_LABELS: dict[str, str] = {
    "set_template_enabled": "通知模板启停",
    "set_template_channels": "通知渠道调整",
    "set_template_level": "通知级别调整",
    "set_template_text": "通知文案调整",
    "set_template_recipients": "通知收件人调整",
    "set_pref_channels": "角色渠道偏好调整",
}


def _categorize_notif_ops(ops: list[dict]) -> tuple[str | None, str | None]:
    if not ops:
        return (None, None)
    op_types = {op.get("op") for op in ops}
    if len(op_types) == 1:
        t = next(iter(op_types))
        if t == "set_template_enabled":
            all_disable = all(op.get("enabled") is False for op in ops)
            all_enable = all(op.get("enabled") is True for op in ops)
            if all_disable:
                return ("template_disable", "停用通知")
            if all_enable:
                return ("template_enable", "启用通知")
            return ("template_toggle", "通知启停(批量)")
        return (t or "unknown", _NOTIF_OP_LABELS.get(t or "", "通知配置调整"))
    return ("mixed", "多类通知配置调整")


def _recipients_zh(recipients: list[dict]) -> str:
    if not recipients:
        return "未配置"
    parts = []
    for r in recipients:
        label = RECIPIENT_ZH.get(r.get("type"), r.get("type") or "?")
        if r.get("cc"):
            label += "(抄送)"
        parts.append(label)
    return " + ".join(parts)


def _format_snapshot(templates: list[dict], preferences: list[dict]) -> str:
    """把当前模板 + 偏好渲染成给 LLM 看的 markdown,聚焦 LLM 决策必需的字段。"""
    lines = ["# 当前模板列表(code → 中文场景)"]
    for t in templates:
        chan_zh = " / ".join(CHANNEL_LABELS.get(c, c) for c in (t.get("default_channels") or []))
        level_zh = LEVEL_LABELS.get(t.get("default_level"), t.get("default_level") or "")
        enabled_zh = "已开" if t.get("enabled") else "已停"
        desc = t.get("description") or t.get("title_tmpl") or ""
        recip_zh = _recipients_zh(t.get("recipients") or [])
        lines.append(
            f"  - `{t['code']}` ({enabled_zh},收件人:{recip_zh},渠道:{chan_zh},级别:{level_zh}) — {desc}"
        )

    lines.append("\n# 当前角色级渠道覆盖(没列出 = 走默认渠道)")
    if not preferences:
        lines.append("  (无)")
    else:
        for p in preferences:
            role_zh = ROLE_ZH.get(p.get("scope_value"), p.get("scope_value"))
            chan_zh = " / ".join(CHANNEL_LABELS.get(c, c) for c in (p.get("channels") or []))
            mute = "(静默)" if p.get("muted") else ""
            lines.append(f"  - {role_zh} 在 `{p.get('template_code')}` 上 → {chan_zh}{mute}")
    return "\n".join(lines)


@router.post("/propose")
async def propose(
    req: ProposeReq,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default="default"),
    x_user_role: str = Header(default="school_admin"),
    authorization: str = Header(default=""),
) -> ProposeResp:
    headers = {
        "X-User-Id": x_user_id or "0",
        "X-Tenant-Id": x_tenant_id or "default",
        "X-User-Role": x_user_role or "school_admin",
    }
    # 透传浏览器登录态 — Sa-Token 全局拦截器要求 Authorization,空 token 一律 401
    if authorization:
        headers["Authorization"] = authorization
    # 1) 拉当前 snapshot
    try:
        async with httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False) as c:
            tr = await c.get("/api/v1/notification-center/templates", headers=headers)
            tr.raise_for_status()
            templates = tr.json().get("data") or []
            pr = await c.get("/api/v1/notification-center/preferences", headers=headers, params={"scope_type": "role"})
            pr.raise_for_status()
            preferences = pr.json().get("data") or []
    except Exception as e:
        logger.exception("notification propose: read snapshot failed")
        return ProposeResp(ok=False, ai_message=f"读取当前通知配置失败:{e}", error_code="READ_FAILED")

    if not templates:
        return ProposeResp(
            ok=False,
            ai_message="还没有任何通知模板。请先让管理员初始化通知中心。",
            error_code="NO_TEMPLATES",
        )

    snapshot = _format_snapshot(templates, preferences)
    user_msg = f"{snapshot}\n\n# 老师指令\n{req.instruction}"

    # 2) LLM 出 op
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
    except Exception as e:
        logger.exception("notification propose: LLM failed")
        return ProposeResp(ok=False, ai_message=f"AI 服务异常:{e}", error_code="LLM_FAILED")

    raw = (turn.text or "").strip()
    # 容错:有时候 LLM 还是 wrap 了 ```json
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except Exception:
        logger.warning("notification propose: LLM returned non-JSON: %r", raw[:200])
        return ProposeResp(
            ok=False,
            ai_message="AI 返回了无法解析的格式,请换种说法再试。",
            error_code="LLM_PARSE_FAILED",
        )

    ops = data.get("ops") or []
    diff_zh = data.get("diff_zh") or ""
    ai_message = data.get("ai_message") or ""

    # 3) ops 校验 — 字段在白名单内 + code 在快照里
    valid_codes = {t["code"] for t in templates}
    valid_channels = set(CHANNEL_LABELS)
    valid_levels = set(LEVEL_LABELS)
    valid_roles = set(ROLE_ZH)
    valid_op_types = {
        "set_template_enabled", "set_template_channels", "set_template_level",
        "set_template_text", "set_template_recipients", "set_pref_channels",
    }
    valid_recipient_types = set(RECIPIENT_ZH)
    for op in ops:
        t = op.get("op")
        if t not in valid_op_types:
            return ProposeResp(ok=False, ai_message=f"AI 输出了未知操作类型 {t}", error_code="INVALID_OP")
        if t.startswith("set_template_") and op.get("code") not in valid_codes:
            return ProposeResp(ok=False, ai_message=f"模板 {op.get('code')} 不存在", error_code="INVALID_OP")
        if t == "set_template_channels":
            for ch in op.get("channels") or []:
                if ch not in valid_channels:
                    return ProposeResp(ok=False, ai_message=f"渠道 {ch} 不支持", error_code="INVALID_OP")
        if t == "set_template_level" and op.get("level") not in valid_levels:
            return ProposeResp(ok=False, ai_message=f"级别 {op.get('level')} 不支持", error_code="INVALID_OP")
        if t == "set_template_recipients":
            recips = op.get("recipients")
            if not isinstance(recips, list) or not recips:
                return ProposeResp(ok=False, ai_message="收件人列表不能为空", error_code="INVALID_OP")
            for r in recips:
                if not isinstance(r, dict):
                    return ProposeResp(ok=False, ai_message="收件人格式错误", error_code="INVALID_OP")
                rt = r.get("type")
                if rt not in valid_recipient_types:
                    return ProposeResp(ok=False, ai_message=f"收件人类型 {rt} 不支持", error_code="INVALID_OP")
                if rt == "static_user" and not r.get("user_id"):
                    return ProposeResp(ok=False, ai_message="static_user 必须带 user_id", error_code="INVALID_OP")
        if t == "set_pref_channels":
            if op.get("scope_type") != "role":
                return ProposeResp(ok=False, ai_message="P0 仅支持角色级偏好(scope_type=role)", error_code="INVALID_OP")
            if op.get("scope_value") not in valid_roles:
                return ProposeResp(ok=False, ai_message=f"角色 {op.get('scope_value')} 不支持", error_code="INVALID_OP")
            if op.get("template_code") not in valid_codes:
                return ProposeResp(ok=False, ai_message=f"模板 {op.get('template_code')} 不存在", error_code="INVALID_OP")
            for ch in op.get("channels") or []:
                if ch not in valid_channels:
                    return ProposeResp(ok=False, ai_message=f"渠道 {ch} 不支持", error_code="INVALID_OP")

    if not ops:
        # LLM 没产生 op = 反问 / 不能做。直接返回 ai_message 让前端展示。
        return ProposeResp(ok=True, ops=[], diff_zh="", ai_message=ai_message or "请告诉我具体想改哪条通知。")

    cat_code, cat_label = _categorize_notif_ops(ops)
    return ProposeResp(
        ok=True,
        ops=ops,
        diff_zh=diff_zh,
        ai_message=ai_message,
        change_category=cat_code,
        change_category_label=cat_label,
    )
