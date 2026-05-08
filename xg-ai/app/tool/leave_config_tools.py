"""§7.1.9 — natural-language → TimePatch translator.

The teacher types something like "考试周（5/15-6/15）禁事假" and we:
  1. Look up the valid leave-type codes from the Java backend.
  2. Send a strict-JSON prompt to DeepSeek.
  3. Validate the parsed JSON against a tight allowlist (path patterns,
     {replace, enable, disable, elevate} ops, ISO dates, known codes).
  4. POST it as a draft TimePatch to /api/v1/leave-config/patches.

Failures degrade gracefully — anything unexpected (LLM returns garbage,
backend rejects, network blip) returns a Chinese-language error string and
NEVER auto-publishes. The teacher always reviews the draft before going live.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import yaml

from app.config import settings
from app.llm.deepseek import DeepSeekProvider

logger = logging.getLogger(__name__)


# ---------- constants used by validator ----------

ALLOWED_OPS = {"replace", "enable", "disable", "elevate"}

# leaveTypes[code=X] | leaveTypes[code=X].maxDays | leaveTypes[code=X].approvalChain | etc.
PATH_RE = re.compile(r"^leaveTypes\[code=([a-zA-Z_][a-zA-Z_0-9]*)\](\.[a-zA-Z_][a-zA-Z_0-9]*)*$")

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---------- HTTP helpers (mirrors query_tools.py style) ----------

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False)


def _headers(ctx: dict) -> dict[str, str]:
    return {
        "X-User-Id": ctx.get("user_id") or "0",
        "X-Tenant-Id": ctx.get("tenant_id") or "default",
        "X-User-Role": ctx.get("user_role") or "school_admin",
    }


async def _get_json(path: str, ctx: dict) -> dict:
    async with _client() as c:
        resp = await c.get(path, headers=_headers(ctx))
        resp.raise_for_status()
        return resp.json()


async def _post_json(path: str, body: dict, ctx: dict) -> dict:
    async with _client() as c:
        resp = await c.post(path, json=body, headers=_headers(ctx))
        resp.raise_for_status()
        return resp.json()


# ---------- LLM prompt + parsing ----------

SYSTEM_PROMPT_TEMPLATE = """你是把高校老师自然语言描述转换为「请销假 TimePatch」的工具。

# 输出契约（严格遵守）
仅输出**一个 JSON 对象**，不要 markdown 代码块、不要解释文字、不要前缀后缀。

# JSON Schema
{
  "type": "time",                       // 必须是字面量 "time"
  "name": "<描述性中文名，如 考试周>",
  "scope": {
    "from": "YYYY-MM-DD",               // 起始日期
    "to":   "YYYY-MM-DD",               // 结束日期（含当天）
    "orgIds": null                       // 全校生效用 null；具体学院传 [id,...]——但当前老师没提学院就用 null
  },
  "diff": [
    { "path": "...", "op": "...", "value": ... }
  ],
  "note": "原文：<把老师的输入原话填这里>"
}

# 路径 path 规则
- 禁用某假别：path = "leaveTypes[code=<code>]", op = "disable"，无 value
- 修改某假别天数上限：path = "leaveTypes[code=<code>].maxDays", op = "replace", value = 整数
- 升级审批链（每档加角色）：path = "leaveTypes[code=<code>].approvalChain", op = "elevate", value = {"addRoles": ["role1",...]}

# 已知假别 code（你只能用这里的）
{valid_codes}

# 已知审批角色 code
counselor / class_master / college_secretary / college_admin / dean /
student_affairs_officer / student_affairs_director / school_admin

# 日期解析
今天是 {today}。如果老师说"考试周"、"5/15-6/15"等相对/简写日期，
请补全为 YYYY-MM-DD，年份默认当前年。

# 失败约定
如果输入完全无法理解，输出 {"error": "<简短中文原因>"}。

# 例子
输入：考试周(5/15-6/15)禁事假
输出：
{
  "type": "time",
  "name": "考试周（不允许事假）",
  "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
  "diff": [{"path": "leaveTypes[code=personal]", "op": "disable"}],
  "note": "原文：考试周(5/15-6/15)禁事假"
}
"""


def _build_prompt(text: str, valid_codes: list[str]) -> str:
    # Plain replace — the template embeds JSON examples with literal '{' and '}'
    # which would clash with str.format placeholder syntax.
    return (
        SYSTEM_PROMPT_TEMPLATE
        .replace("{valid_codes}", "、".join(valid_codes) if valid_codes else "（暂无）")
        .replace("{today}", date.today().isoformat())
    )


def _strip_code_fence(s: str) -> str:
    """Belt-and-braces: even though we tell the LLM no markdown, sometimes it slips."""
    s = s.strip()
    if s.startswith("```"):
        # Drop opening fence (with optional language tag)
        s = re.sub(r"^```(?:json)?\s*", "", s)
        # Drop closing fence
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _parse_llm_output(raw: str) -> dict | None:
    try:
        return json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError:
        return None


# ---------- validation ----------

def _validate(parsed: dict, valid_codes: set[str]) -> tuple[bool, str]:
    """Return (ok, error_message). On success error_message is empty."""
    if not isinstance(parsed, dict):
        return False, "LLM 返回的不是 JSON 对象"
    if parsed.get("error"):
        return False, f"LLM 表示无法理解：{parsed['error']}"
    if parsed.get("type") != "time":
        return False, f"type 必须是 'time'，收到 {parsed.get('type')!r}"
    name = parsed.get("name")
    if not isinstance(name, str) or not name.strip():
        return False, "name 不能为空"

    scope = parsed.get("scope")
    if not isinstance(scope, dict):
        return False, "scope 必须是对象"
    f, t = scope.get("from"), scope.get("to")
    if not (isinstance(f, str) and ISO_DATE_RE.match(f)):
        return False, f"scope.from 不是合法 YYYY-MM-DD：{f!r}"
    if not (isinstance(t, str) and ISO_DATE_RE.match(t)):
        return False, f"scope.to 不是合法 YYYY-MM-DD：{t!r}"
    if f > t:
        return False, "scope.from 必须早于或等于 scope.to"
    org_ids = scope.get("orgIds", None)
    if org_ids is not None and not (isinstance(org_ids, list)
                                    and all(isinstance(x, int) for x in org_ids)):
        return False, "scope.orgIds 必须是 null 或 int 数组"

    diffs = parsed.get("diff")
    if not isinstance(diffs, list) or not diffs:
        return False, "diff 必须是非空数组"
    for i, d in enumerate(diffs):
        if not isinstance(d, dict):
            return False, f"diff[{i}] 不是对象"
        path = d.get("path")
        op = d.get("op")
        if not isinstance(path, str) or not PATH_RE.match(path):
            return False, f"diff[{i}].path 不合法：{path!r}（应形如 leaveTypes[code=X]…）"
        m = PATH_RE.match(path)
        code = m.group(1) if m else ""
        if code not in valid_codes:
            return False, f"diff[{i}].path 引用了未知假别 code：{code}（已知：{'、'.join(sorted(valid_codes))}）"
        if op not in ALLOWED_OPS:
            return False, f"diff[{i}].op 不合法：{op!r}（必须是 {ALLOWED_OPS}）"
        if op == "replace" and "value" not in d:
            return False, f"diff[{i}] op=replace 必须带 value"
        if op == "elevate":
            v = d.get("value")
            if not isinstance(v, dict) or not isinstance(v.get("addRoles"), list):
                return False, f"diff[{i}] op=elevate 的 value 必须是 {{addRoles: [...]}}"

    return True, ""


# ---------- top-level handler ----------

async def _fetch_leave_type_codes(ctx: dict) -> list[str]:
    """Pull current published config to know which leave-type codes are valid."""
    body = await _get_json("/api/v1/leave-config/base/state", ctx)
    state = (body.get("data") or {})
    published = state.get("published") or state.get("draft") or {}
    config = published.get("config") or {}
    types = config.get("leaveTypes") or []
    return [t.get("code") for t in types if isinstance(t, dict) and t.get("code")]


async def nl_to_time_patch(args: dict[str, Any], ctx: dict) -> str:
    """The user-facing tool. Returns a Chinese-language status string.

    On success: a "已为你创建草稿" message with the patch_id and a hint to
    review in the editor before publishing.
    On any failure: a clear error message — never raises, never publishes.
    """
    text = (args.get("text") or "").strip()
    if not text:
        return "请提供自然语言描述，例如：『考试周（5/15-6/15）禁事假』"

    # Step 1: figure out which leave codes are valid in this tenant.
    try:
        codes = await _fetch_leave_type_codes(ctx)
    except Exception as e:
        logger.exception("nl_to_time_patch: fetch leave types failed")
        return f"无法读取已发布配置（{e}），暂时无法翻译为 TimePatch"

    if not codes:
        return "当前租户尚未初始化基线配置，无法创建 TimePatch（请先在编辑页发布一份基线）"

    # Step 2: ask the LLM.
    provider = DeepSeekProvider()
    prompt = _build_prompt(text, codes)
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=512,
        )
    except Exception as e:
        logger.exception("nl_to_time_patch: LLM call failed")
        return f"LLM 调用失败（{e}），可手动在编辑页用受限模板创建 TimePatch"

    parsed = _parse_llm_output(turn.text)
    if parsed is None:
        return f"LLM 输出不是合法 JSON，原文：{turn.text[:200]}"

    ok, err = _validate(parsed, set(codes))
    if not ok:
        return f"翻译结果未通过校验：{err}"

    # Step 3: hand to Java backend as a draft. Never auto-publish — teacher reviews.
    body = {
        "type": parsed["type"],
        "name": parsed["name"],
        "scope": parsed["scope"],
        "diff": parsed["diff"],
        "enabled": True,
        "note": parsed.get("note") or f"AI 翻译自：{text}",
    }
    try:
        resp = await _post_json("/api/v1/leave-config/patches", body, ctx)
    except httpx.HTTPStatusError as e:
        logger.warning("nl_to_time_patch: Java backend %s: %s", e.response.status_code, e.response.text[:200])
        return f"创建草稿失败（HTTP {e.response.status_code}），请稍后重试或手动创建"
    except Exception as e:
        logger.exception("nl_to_time_patch: Java backend call failed")
        return f"创建草稿失败（{e}）"

    patch = (resp.get("data") or {})
    patch_id = patch.get("patch_id") or patch.get("patchId") or "?"
    return (
        f"已为你创建 TimePatch 草稿：「{parsed['name']}」"
        f"（{parsed['scope']['from']} → {parsed['scope']['to']}），"
        f"patch_id={patch_id[:8]}…。"
        f"草稿不会立即生效——请到「请销假规则 → Patch」tab 检查后点「发布」。"
    )


# ============================================================
# nl_to_org_patch — twin of nl_to_time_patch for OrgPatch
# ============================================================

ORG_SYSTEM_PROMPT_TEMPLATE = """你是把高校老师自然语言描述转换为「请销假 OrgPatch」的工具。

# 输出契约（严格遵守）
仅输出**一个 JSON 对象**，不要 markdown 代码块、不要解释文字、不要前缀后缀。

# JSON Schema
{
  "type": "org",                          // 必须是字面量 "org"
  "name": "<可选名称，可省略>",
  "scope": {
    "orgIds": [<int>, ...],               // 必填，必须从「已知学院」列表里选
    "orgNamesSnapshot": ["<对应学院名>", ...],
    "studentTypes": ["本科"|"硕士"|"博士"] // 可选；老师没明说就别加
  },
  "diff": [
    { "path": "...", "op": "...", "value": ... }
  ],
  "note": "原文：<把老师的输入原话填这里>"
}

# 路径 path 规则
- 修改某假别天数上限：path = "leaveTypes[code=<code>].maxDays", op = "replace", value = 整数
- 禁用某假别：       path = "leaveTypes[code=<code>]", op = "disable"，无 value
- 升级审批链：       path = "leaveTypes[code=<code>].approvalChain", op = "elevate", value = {"addRoles": [...]}

# 已知假别 code（你只能用这里的）
{valid_codes}

# 已知学院（id, name；orgIds 必须从这里选）
{colleges}

# 已知审批角色 code
counselor / class_master / college_secretary / college_admin / dean /
student_affairs_officer / student_affairs_director / school_admin

# 失败约定
如果输入完全无法理解，输出 {"error": "<简短中文原因>"}。
如果老师提到的学院不在已知列表里，输出 error 解释。

# 例子
输入：艺术学院本科生事假上限改成 14 天
输出：
{
  "type": "org",
  "name": "艺术学院本科生事假特批",
  "scope": {"orgIds": [1013], "orgNamesSnapshot": ["艺术学院"], "studentTypes": ["本科"]},
  "diff": [{"path": "leaveTypes[code=personal].maxDays", "op": "replace", "value": 14}],
  "note": "原文：艺术学院本科生事假上限改成 14 天"
}
"""


def _coerce_int(v) -> int | None:
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.isdigit():
        return int(v)
    return None


def _build_org_prompt(text: str, valid_codes: list[str], colleges: list[dict]) -> str:
    college_lines = "\n".join(
        f"  - id={_coerce_int(c.get('id'))} name={c.get('name')}"
        for c in colleges if _coerce_int(c.get("id")) is not None
    ) or "  （暂无）"
    return (
        ORG_SYSTEM_PROMPT_TEMPLATE
        .replace("{valid_codes}", "、".join(valid_codes) if valid_codes else "（暂无）")
        .replace("{colleges}", college_lines)
    )


async def _fetch_colleges(ctx: dict) -> list[dict]:
    """List of {id,name} colleges from /leave-config/colleges."""
    body = await _get_json("/api/v1/leave-config/colleges", ctx)
    return body.get("data") or []


def _validate_org(parsed: dict, valid_codes: set[str], valid_org_ids: set[int]) -> tuple[bool, str]:
    if not isinstance(parsed, dict):
        return False, "LLM 返回的不是 JSON 对象"
    if parsed.get("error"):
        return False, f"LLM 表示无法理解：{parsed['error']}"
    if parsed.get("type") != "org":
        return False, f"type 必须是 'org'，收到 {parsed.get('type')!r}"

    scope = parsed.get("scope")
    if not isinstance(scope, dict):
        return False, "scope 必须是对象"
    org_ids = scope.get("orgIds")
    if not (isinstance(org_ids, list) and org_ids and all(isinstance(x, int) for x in org_ids)):
        return False, "scope.orgIds 必须是非空 int 数组"
    for oid in org_ids:
        if oid not in valid_org_ids:
            return False, f"scope.orgIds 含未知学院 id={oid}（已知：{sorted(valid_org_ids)}）"

    student_types = scope.get("studentTypes")
    if student_types is not None:
        if not (isinstance(student_types, list) and all(isinstance(x, str) for x in student_types)):
            return False, "scope.studentTypes 必须是 string 数组或省略"
        for s in student_types:
            if s not in {"本科", "硕士", "博士"}:
                return False, f"scope.studentTypes 含未知值 {s!r}（仅本科/硕士/博士）"

    diffs = parsed.get("diff")
    if not isinstance(diffs, list) or not diffs:
        return False, "diff 必须是非空数组"
    for i, d in enumerate(diffs):
        if not isinstance(d, dict):
            return False, f"diff[{i}] 不是对象"
        path = d.get("path")
        op = d.get("op")
        if not isinstance(path, str) or not PATH_RE.match(path):
            return False, f"diff[{i}].path 不合法：{path!r}"
        m = PATH_RE.match(path)
        code = m.group(1) if m else ""
        if code not in valid_codes:
            return False, f"diff[{i}].path 引用了未知假别 code：{code}"
        if op not in ALLOWED_OPS:
            return False, f"diff[{i}].op 不合法：{op!r}"
        if op == "replace" and "value" not in d:
            return False, f"diff[{i}] op=replace 必须带 value"
        if op == "elevate":
            v = d.get("value")
            if not isinstance(v, dict) or not isinstance(v.get("addRoles"), list):
                return False, f"diff[{i}] op=elevate 的 value 必须是 {{addRoles: [...]}}"
    return True, ""


async def nl_to_org_patch(args: dict[str, Any], ctx: dict) -> str:
    """Twin of nl_to_time_patch for OrgPatch. Same contract: never auto-publish.

    On success: status string with patch_id; teacher reviews + publishes.
    On any failure: clear error string; never raises.
    """
    text = (args.get("text") or "").strip()
    if not text:
        return "请提供自然语言描述，例如：『艺术学院本科生事假上限 14 天』"

    try:
        codes = await _fetch_leave_type_codes(ctx)
        colleges = await _fetch_colleges(ctx)
    except Exception as e:
        logger.exception("nl_to_org_patch: fetch context failed")
        return f"无法读取配置（{e}），暂时无法翻译为 OrgPatch"

    if not codes:
        return "当前租户尚未初始化基线配置，无法创建 OrgPatch（请先发布一份基线）"
    if not colleges:
        return "当前租户没有配置学院（org_unit type=college），OrgPatch 无作用范围"

    provider = DeepSeekProvider()
    prompt = _build_org_prompt(text, codes, colleges)
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=512,
        )
    except Exception as e:
        logger.exception("nl_to_org_patch: LLM call failed")
        return f"LLM 调用失败（{e}），可手动在编辑页创建 OrgPatch"

    parsed = _parse_llm_output(turn.text)
    if parsed is None:
        return f"LLM 输出不是合法 JSON，原文：{turn.text[:200]}"

    valid_org_ids = {oid for c in colleges if (oid := _coerce_int(c.get("id"))) is not None}
    ok, err = _validate_org(parsed, set(codes), valid_org_ids)
    if not ok:
        return f"翻译结果未通过校验：{err}"

    body = {
        "type": parsed["type"],
        "name": parsed.get("name") or f"OrgPatch（{','.join(parsed['scope'].get('orgNamesSnapshot') or [])}）",
        "scope": parsed["scope"],
        "diff": parsed["diff"],
        "enabled": True,
        "note": parsed.get("note") or f"AI 翻译自：{text}",
    }
    try:
        resp = await _post_json("/api/v1/leave-config/patches", body, ctx)
    except httpx.HTTPStatusError as e:
        logger.warning("nl_to_org_patch: Java backend %s: %s", e.response.status_code, e.response.text[:200])
        return f"创建草稿失败（HTTP {e.response.status_code}），请稍后重试或手动创建"
    except Exception as e:
        logger.exception("nl_to_org_patch: Java backend call failed")
        return f"创建草稿失败（{e}）"

    patch = (resp.get("data") or {})
    patch_id = patch.get("patch_id") or patch.get("patchId") or "?"
    names = ",".join(parsed["scope"].get("orgNamesSnapshot") or [])
    return (
        f"已为你创建 OrgPatch 草稿：「{body['name']}」"
        f"（作用学院：{names}），patch_id={patch_id[:8]}…。"
        f"草稿不会立即生效——请到「请销假规则 → Patch」tab 检查后点「发布」。"
    )


# ============================================================
# recommend_leave_type_field — L5 字段级 copilot
# ============================================================

RECOMMEND_PROMPT = """你是国内高校学工配置专家。给单个字段一个合理推荐值 + 简短中文理由。

# 输入
- 假别 code: {code}
- 假别名称: {name}（可能为空）
- 字段:    {field}
- 当前值:  {current_value}
- 学校 hint: {school_hint}

# 字段含义（必读）
- maxDays:       该假别单次最长天数。事假典型 5-10；病假典型 14-60；公假常不限。
- advanceDays:   学生提交时距开始日的最少提前天数（事假典型 3，急病不要提前）。
- termCapDays:   一学期累计上限（事假 25 标准，严格 15；病假 60 标准；多数假别不设）。

# 输出契约（严格遵守）
仅输出 JSON：
{
  "value": <整数或 null（null 表示"建议不设"）>,
  "reason": "<≤80 字中文理由，包含上下区间参考，例如「标准本科 7-10 天，严管 5，宽松 14；建议 8 兼顾覆盖率」>"
}

不要 markdown，不要 ```json 包裹。"""


async def recommend_leave_type_field(args: dict[str, Any], ctx: dict) -> str:
    """L5 — recommend a single numeric field for one leave type.
    Returns plain JSON string {value, reason}; UI parses + displays.
    """
    code = (args.get("code") or "").strip()
    field = (args.get("field") or "").strip()
    current_value = args.get("current_value")
    name = (args.get("name") or "").strip()
    school_hint = (args.get("school_hint") or "中型本科院校").strip()

    if not code or field not in {"maxDays", "advanceDays", "termCapDays"}:
        return json.dumps({"value": None, "reason": "参数缺失或字段不支持"}, ensure_ascii=False)

    prompt = (
        RECOMMEND_PROMPT
        .replace("{code}", code)
        .replace("{name}", name or "（未填）")
        .replace("{field}", field)
        .replace("{current_value}", str(current_value) if current_value is not None else "（未填）")
        .replace("{school_hint}", school_hint)
    )

    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"为假别 {code} 推荐 {field} 的合理值"},
            ],
            temperature=0.2,
            max_tokens=200,
        )
    except Exception as e:
        logger.exception("recommend_leave_type_field: LLM failed")
        return json.dumps({"value": None, "reason": f"AI 推荐失败：{e}"}, ensure_ascii=False)

    parsed = _parse_llm_output(turn.text)
    if not isinstance(parsed, dict):
        return json.dumps({"value": None, "reason": "AI 返回不是合法 JSON"}, ensure_ascii=False)
    val = parsed.get("value")
    if val is not None and not isinstance(val, int):
        val = None
    return json.dumps({
        "value": val,
        "reason": str(parsed.get("reason") or "（无理由）")[:200],
    }, ensure_ascii=False)


# ============================================================
# explain_base_diff — L2 改动影响摘要
# ============================================================

EXPLAIN_PROMPT = """你是国内高校学工配置专家。给老师讲清楚一次配置改动的具体内容和潜在影响。在反馈文案里请用「贵校」/「老师」称呼，不要用「你们」「你校」。

# 输入
两份 leave_config_base.config JSONB（published vs draft），结构：
{
  "leaveTypes": [{"code":"...", "name":"...", "enabled":bool, "maxDays":int|null,
                  "advanceDays":int|null, "termCapDays":int|null,
                  "proof":{"required":"none|optional|required"},
                  "approvalChain":[{"maxDays":int, "roles":[...]}]}],
  "notifications": [...]
}

# 任务
对比两份配置，输出一段 Markdown 摘要（≤300 字）：
1. 列出每条具体改动（用 → 表示前后）
2. 给每条改动一句"对学生 / 审批人的实际影响"，用普通话
3. 如有"潜在风险"（如 maxDays 改小但审批链顶档没改），单独提醒

# 例子
输入 published 事假 maxDays=7，draft 事假 maxDays=5：
输出：
**改动 1**：事假最长天数 7 → 5
- 影响：原本能请 6-7 天事假的学生现在会被拦截（约占事假申请的 10-15%）
- ⚠ 风险：审批链顶档仍为 7 天，建议同步改成 5

# 失败约定
如配置完全相同，回："没有实质改动。"

仅输出 Markdown 摘要本身（不要 ```包裹），不要 JSON。"""


async def explain_base_diff(args: dict[str, Any], ctx: dict) -> str:
    """L2 — given (published_config, draft_config), return a Chinese
    Markdown summary of what changed + implications. Pure LLM, no DB."""
    published = args.get("published") or {}
    draft = args.get("draft") or {}
    if not isinstance(published, dict) or not isinstance(draft, dict):
        return "**输入格式错误：published / draft 必须是 config 对象。**"
    if json.dumps(published, sort_keys=True, ensure_ascii=False) == json.dumps(draft, sort_keys=True, ensure_ascii=False):
        return "没有实质改动。"

    user_msg = (
        "published:\n```json\n"
        + json.dumps(published, ensure_ascii=False, indent=2)
        + "\n```\n\ndraft:\n```json\n"
        + json.dumps(draft, ensure_ascii=False, indent=2)
        + "\n```"
    )
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": EXPLAIN_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=600,
        )
    except Exception as e:
        logger.exception("explain_base_diff: LLM failed")
        return f"AI 摘要失败：{e}"
    return turn.text.strip()


# ============================================================
# audit_leave_config — Phase 3 配置体检（AI critic）
# ============================================================

AUDIT_PROMPT = """你是国内高校学工配置专家。给一套 leave 配置做全面体检，找出问题和优化点。在体检报告里请用「贵校」/「老师」称呼，不要用「你们」「你校」。

# 输入
- base 配置：leave_config_base.config（含 leaveTypes / notifications）
- patches：所有 published+enabled 的 OrgPatch / TimePatch
- 节假日列表（可选）

# 必查的 7 类问题
1. **配置内部矛盾**：maxDays 与 approvalChain 顶档不一致；advanceDays 设了但有"急病/紧急"假别；termCapDays < maxDays 等
2. **常见假别缺失**：婚假 / 丧假 / 学术活动假 / 就业活动假 / 实习假——按场景必要性提醒
3. **审批链合理性**：单档无分级、顶档角色过重、班主任与辅导员重复等
4. **证明材料**：病假未要求证明、公假未要求证明等
5. **patch 冲突或冗余**：两个 OrgPatch 改同一字段；TimePatch 时段重叠且改同字段
6. **patch 已过期但未禁用**（TimePatch.scope.to < 今天）
7. **缺少防滥用**：长事假无 termCapDays、无 advanceDays 等

# 输出契约
返回 Markdown 报告，结构如下（严格遵守）：

## 📋 体检概览
（一段总结，30-60 字）

## 🚨 严重问题（必须修）
（如无则写"无"）
- **问题描述**
  - 影响：xxx
  - 建议：xxx

## ⚠️ 中等问题（建议修）
（如无则写"无"）
- ...

## 💡 优化建议（可选改）
（如无则写"无"）
- ...

# 写作要求
- 全部中文，不要出现 maxDays/advanceDays 等英文字段名（用「最长天数」「提前申请天数」等中文）
- 每条都给出可操作的具体建议
- 避免空泛词如"建议优化"，要说"建议改成 X"
- 如无任何问题，只输出 "## 📋 体检概览\n\n配置健康，未发现问题。"

仅输出 Markdown 报告本身，不要 ```包裹。"""


async def audit_leave_config(args: dict[str, Any], ctx: dict) -> str:
    """Phase 3 — full-config audit. Pulls live config + patches and asks LLM
    to surface contradictions, missing types, anti-patterns. Returns Chinese
    Markdown report. No DB writes.
    """
    try:
        state_resp = await _get_json("/api/v1/leave-config/base/state", ctx)
        state = state_resp.get("data") or {}
        base = (state.get("published") or {}).get("config") or {}
    except Exception as e:
        logger.exception("audit_leave_config: fetch base failed")
        return f"无法读取已发布配置（{e}），暂时无法体检"

    patches = []
    try:
        for ptype in ("org", "time"):
            r = await _get_json(f"/api/v1/leave-config/patches?type={ptype}", ctx)
            for p in (r.get("data") or []):
                if p.get("status") == "published" and p.get("enabled"):
                    patches.append(p)
    except Exception as e:
        logger.warning("audit_leave_config: patches fetch failed: %s", e)

    holidays_count = 0
    try:
        h = await _get_json("/api/v1/leave-config/holidays", ctx)
        holidays_count = len(h.get("data") or [])
    except Exception:
        pass

    today = date.today().isoformat()
    user_msg = (
        f"今天：{today}\n"
        f"已配置节假日数：{holidays_count}\n\n"
        f"base 配置：\n```json\n{json.dumps(base, ensure_ascii=False, indent=2)}\n```\n\n"
        f"已发布的 {len(patches)} 个 patch：\n```json\n{json.dumps(patches, ensure_ascii=False, indent=2, default=str)}\n```"
    )

    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": AUDIT_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=1500,
        )
    except Exception as e:
        logger.exception("audit_leave_config: LLM failed")
        return f"AI 体检失败：{e}"
    return turn.text.strip()


# ============================================================
# wizard_chat — 对话式配置向导（4 轮）
# ============================================================

WIZARD_ROUND1_PROMPT = """你是国内高校请销假配置助手。老师正在用自然语言告诉你贵校用哪些假别。
你的任务：解析老师的话，更新 leaveTypes 列表。在所有面向老师的反馈文案里，请用「贵校」/「老师」称呼，不要用「你们」「你们学校」。

# 当前 leaveTypes（可能为空数组，可能已有几类）
{current_types}

# 已知的标准 code 映射（必须用这些 code）
- 事假 → personal
- 病假 / 病假（在校） → sick_on_campus
- 病假（离校） → sick_off_campus
- 公假 → official
- 周末离校 / 外宿 → weekend
- 婚假 → marriage
- 丧假 → bereavement
- 学术活动假 / 学术假 → academic
- 就业活动假 / 就业假 → job_seeking
- 实习假 → internship
- 其他自定义 → 用拼音首字母缩写或英文小写下划线

# 输出契约
仅返回 JSON 对象（不要 markdown）：
{
  "updated_types": [
    {"code":"...", "name":"...", "enabled":true}
  ],
  "ai_message": "<≤80 字中文反馈，告诉老师你做了什么。例如「已为你启用 5 类假别：事假、病假、公假、婚假、丧假」>"
}

规则：
- 老师没说的假别保留原样（不要删）
- 老师明确说"禁用 X"才设 enabled=false
- 新假别默认 enabled=true
- 失败时输出 {"updated_types":[当前原样], "ai_message":"<解释>"}"""


WIZARD_ROUND2_PROMPT = """你是国内高校请销假配置助手。老师正在告诉你各假别的数值限制（最长天数 / 提前申请天数 / 学期累计上限 / 证明材料）。
你的任务：解析老师的话，更新当前 leaveTypes 各项数值。在所有面向老师的反馈文案里，请用「贵校」/「老师」称呼，不要用「你们」「你们学校」。

# 当前 leaveTypes
{current_types}

# 字段映射
- "最多 N 天" / "上限 N 天" → maxDays = N
- "不限" → maxDays = null
- "提前 N 天" → advanceDays = N
- "学期累计 N 天" / "一学期最多 N 天" → termCapDays = N
- "需要证明" / "必须证明" → proof.required = "required"
- "可不传证明" / "选填证明" → proof.required = "optional"
- "不允许传证明" → proof.required = "none"
- "扣节假日" / "节假日不计" → excludeHolidays = true

# 输出契约
仅返回 JSON 对象：
{
  "updated_types": [
    {"code":"personal","name":"事假","enabled":true,"maxDays":7,"advanceDays":3,"termCapDays":25,"proof":{"required":"optional"},"excludeHolidays":false},
    ...
  ],
  "ai_message": "<≤100 字中文反馈，列出关键改动>"
}

规则：
- 老师没提的字段保留当前值（不要清空）
- 老师没提的假别完全保留
- approvalChain 字段不动（下一轮处理）"""


WIZARD_ROUND3_PROMPT = """你是国内高校请销假配置助手。老师正在告诉你审批链怎么分档。在所有面向老师的反馈文案里，请用「贵校」/「老师」称呼，不要用「你们」「你们学校」。
你的任务：把老师的描述解析为 approvalChain 数组，应用到所有启用的假别（除非老师指定某假别特殊）。

# 当前 leaveTypes
{current_types}

# 审批角色 code（必须用这些）
counselor = 辅导员
class_master = 班主任
college_secretary = 院系书记
college_admin = 院系管理员
dean = 院系领导
student_affairs_officer = 学工处人员
student_affairs_director = 学工部部长
school_admin = 校级管理员

# 例子
老师："3 天内辅导员；3-7 天加院系书记；7+ 加学工处人员"
→ 每个假别的 approvalChain：
  [{maxDays: 3, roles: ["counselor"]},
   {maxDays: 7, roles: ["counselor", "college_secretary"]},
   {maxDays: <该假别的maxDays>, roles: ["counselor", "college_secretary", "student_affairs_officer"]}]

老师："所有假别都辅导员审批" → approvalChain = [{maxDays:<maxDays>, roles:["counselor"]}]

# 输出契约
仅返回 JSON 对象：
{
  "updated_types": [...完整 leaveTypes 数组，仅 approvalChain 字段改动...],
  "ai_message": "<≤80 字中文反馈>"
}

规则：
- 仅修改 approvalChain，其他字段（maxDays/advanceDays/proof/...）保留
- 顶档 maxDays 用该假别的 maxDays（如 maxDays 为 null 用 365）
- 没启用的假别不动"""


WIZARD_PROMPTS = {
    1: WIZARD_ROUND1_PROMPT,
    2: WIZARD_ROUND2_PROMPT,
    3: WIZARD_ROUND3_PROMPT,
}


async def wizard_chat(args: dict[str, Any], ctx: dict) -> str:
    """对话式 wizard 第 1-3 轮的统一解析工具。
    第 4 轮（特殊规则）走 nl_to_time_patch / nl_to_org_patch；不走这里。

    输入: {round: 1|2|3, text: str, current_types: [...]}
    输出: JSON 字符串 {updated_types: [...], ai_message: str}
    """
    round_num = args.get("round")
    text = (args.get("text") or "").strip()
    current_types = args.get("current_types") or []

    if round_num not in WIZARD_PROMPTS:
        return json.dumps({
            "updated_types": current_types,
            "ai_message": f"不支持的轮次 {round_num}",
        }, ensure_ascii=False)
    if not text:
        return json.dumps({
            "updated_types": current_types,
            "ai_message": "请输入描述，例如「事假、病假、公假，事假最多 7 天提前 3 天」",
        }, ensure_ascii=False)

    prompt = WIZARD_PROMPTS[round_num].replace(
        "{current_types}", json.dumps(current_types, ensure_ascii=False, indent=2),
    )
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            max_tokens=1200,
        )
    except Exception as e:
        logger.exception("wizard_chat: LLM failed")
        return json.dumps({
            "updated_types": current_types,
            "ai_message": f"AI 解析失败：{e}，请稍后重试或用表单方式继续",
        }, ensure_ascii=False)

    parsed = _parse_llm_output(turn.text)
    if not isinstance(parsed, dict) or "updated_types" not in parsed:
        return json.dumps({
            "updated_types": current_types,
            "ai_message": "AI 返回不是合法 JSON，已保留原配置。原文：" + (turn.text[:80] if turn.text else ""),
        }, ensure_ascii=False)

    updated = parsed.get("updated_types")
    if not isinstance(updated, list):
        updated = current_types

    # 防御性恢复：LLM 经常违反 prompt 里"老师没提的假别完全保留"的指令，
    # 把没提到的 code 从输出里删掉。曾经发生过 published 6 假别 → wizard
    # 微调一句 → LLM 只回 1 个 → 发布后 5 个永久丢失的事故。
    # 这里把 current_types 里有、updated 里缺的 code 强制补回来；老师真要
    # 删某个假别得显式去 base editor 删，wizard 不能默默吞。
    restored: list[str] = []
    if isinstance(current_types, list) and current_types:
        code_to_orig = {
            t["code"]: t for t in current_types
            if isinstance(t, dict) and t.get("code")
        }
        updated_codes = {
            t.get("code") for t in updated
            if isinstance(t, dict) and t.get("code")
        }
        for code, orig in code_to_orig.items():
            if code not in updated_codes:
                updated.append(orig)
                restored.append(code)

    msg = str(parsed.get("ai_message") or "已更新")[:200]
    if restored:
        msg = f"{msg}（自动保留 AI 漏掉的 {len(restored)} 类：{'/'.join(restored)}）"
    return json.dumps({
        "updated_types": updated,
        "ai_message": msg,
    }, ensure_ascii=False)


# ============================================================
# default_leave_config — wizard 起步的"建议默认"配置
# ============================================================
#
# 数据源：app/data/default_leave_config.yaml（基于真实学校请假系统截图整理，
# 已剔除因私请假和出校门请假）。前端 wizard 进入时调一次这个工具拿到默认
# leaveTypes 作为草稿起点；之后让老师对话微调或直接发布。

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "default_leave_config.yaml"
_DEFAULT_CACHE: dict[str, Any] = {"mtime": 0.0, "data": None}


def _load_default_leave_types() -> list[dict[str, Any]]:
    try:
        st = _DEFAULT_PATH.stat()
        if _DEFAULT_CACHE["data"] is not None and _DEFAULT_CACHE["mtime"] == st.st_mtime:
            return _DEFAULT_CACHE["data"]
        with _DEFAULT_PATH.open("r", encoding="utf-8") as f:
            doc = yaml.safe_load(f) or {}
        types = doc.get("leaveTypes") or []
        if not isinstance(types, list):
            types = []
        _DEFAULT_CACHE["mtime"] = st.st_mtime
        _DEFAULT_CACHE["data"] = types
        return types
    except Exception:
        logger.exception("default_leave_config.yaml load failed")
        return []


async def get_default_leave_config(args: dict[str, Any], ctx: dict) -> str:
    """Return a JSON dict {leaveTypes: [...], notifications: []} ready to drop
    into LeaveConfigContent. Source data lives in default_leave_config.yaml,
    which is hot-reloaded on mtime change so editing the YAML doesn't need a
    sidecar restart.
    """
    types = _load_default_leave_types()
    return json.dumps({
        "leaveTypes": types,
        "notifications": [],
    }, ensure_ascii=False)

