"""LangGraph agent: edit a workflow DSL via natural language.

Input: current DSL (object) + instruction (str) + optional history.
Output: full new DSL (object), schema-validated. On schema error we feed the
errors back to the LLM and retry once.

Cross-node-reference validation (next/rejected_next/branches.next must point
to existing ids) runs after schema validation; the frontend re-validates so
this is defense in depth, not a hard gate.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, TypedDict

from jsonschema import Draft7Validator
from langgraph.graph import END, StateGraph

from app.llm.deepseek import DeepSeekProvider
from app.llm.provider import ChatMessage

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent / "schema.json"
_SCHEMA = json.loads(_SCHEMA_PATH.read_text())
_VALIDATOR = Draft7Validator(_SCHEMA)

MAX_RETRIES = 1


class AuthorState(TypedDict, total=False):
    current_dsl: dict[str, Any]
    instruction: str
    available_roles: list[dict[str, str]]
    dsl: dict[str, Any] | None
    summary: str
    attempts: list[dict[str, Any]]
    error_message: str | None


def _format_roles(available_roles: list[dict[str, str]]) -> str:
    if not available_roles:
        return "（调用方未提供可用角色清单，禁止生成 approval 节点）"
    lines = [f"  - `{r.get('code')}`：{r.get('name')}" for r in available_roles]
    return "\n".join(lines)


def _system_prompt(available_roles: list[dict[str, str]]) -> str:
    return (
        "你是工作流编辑助手。用户给你一个**当前工作流 DSL（JSON）**和一条**自然语言修改指令**，"
        "你输出一段**纯 JSON**（不要 markdown 代码块、不要任何解释文字），是修改后的完整 DSL。\n\n"
        "## 节点类型速查\n"
        "- form_submit: 学生提交，必须有 next\n"
        "- approval: 审批节点，必须有 assignee.role/scope 和 next；可选 rejected_next、timeout\n"
        "- condition: 分支判断，必须有 branches[]，每条 {when, next}；最后一条 when='default' 兜底\n"
        "- publicity: 公示期，必须有 publicity.duration 和 next；可选 interrupt_on\n"
        "- notification: 通知，必须有 next\n"
        "- end: 终态，必须有 status (completed/rejected)\n\n"
        "## 引用约束\n"
        "- 所有 next / rejected_next / branches[].next / interrupt_on.next 必须指向同一 nodes 数组里存在的 id\n"
        "- start 字段必须等于某个 node id\n\n"
        "## 可用审批角色（**严禁使用清单外的 code**）\n"
        f"{_format_roles(available_roles)}\n\n"
        "## 角色匹配规则（重要）\n"
        "- approval.assignee.role 必须**精确等于**清单中的某个 code，不能改写、不能猜测、不能创造新 code\n"
        "- 用户的自然语言（如「学工处」「辅导员」「院领导」）需要你映射到清单中**语义最接近**的 code\n"
        "- 如果用户描述的角色在清单中**找不到任何合理对应**（例如清单里没有「学工处」相关角色），"
        "**不要硬塞一个最像的**。请放弃生成 DSL，改为输出特殊响应：\n"
        "  ```\n"
        '  {"need_clarification": true, "missing_roles": ["学工处"], "available": ["dean (院领导)", "..."]}\n'
        "  ```\n"
        "  然后在 SUMMARY 行用中文向用户解释找不到哪个角色、清单里有哪些可用、请用户改用哪个或新建。\n"
        "- 如果用户描述能找到接近匹配（如「班主任 → counselor」），可以直接使用并在 SUMMARY 注明映射关系\n\n"
        "## scope 枚举\n"
        "- same_class / same_college / global\n\n"
        "## 时长格式\n"
        "- '48h' / '7d' / '30m'\n\n"
        "## 输出要求\n"
        "- 正常情况：输出修改后的**完整** DSL JSON（保留 code/name/module/start/form 等顶层字段）\n"
        "- 角色找不到：输出 `{\"need_clarification\": true, ...}` 那个对象\n"
        "- 在最后追加一行 `<<SUMMARY>>` 加一句中文说明（做了什么 / 为什么放弃）\n"
        "- SUMMARY 在 JSON 之后，不要塞进 JSON 里\n"
    )


def _user_prompt(current_dsl: dict, instruction: str, prev_attempt: dict | None) -> str:
    base = (
        f"## 当前 DSL\n```json\n{json.dumps(current_dsl, ensure_ascii=False, indent=2)}\n```\n\n"
        f"## 修改指令\n{instruction}"
    )
    if not prev_attempt:
        return base
    errs = "\n".join(f"- {e}" for e in prev_attempt.get("errors", []))
    return (
        f"{base}\n\n"
        f"你上次返回的 JSON 有以下错误，请**只修复这些问题**重新输出完整 JSON：\n{errs}\n\n"
        f"上次的 JSON：\n{json.dumps(prev_attempt.get('dsl') or {}, ensure_ascii=False, indent=2)}"
    )


def _split_json_and_summary(text: str) -> tuple[dict[str, Any] | None, str]:
    """Tolerate stray code fences, prose, and the trailing <<SUMMARY>> line."""
    text = text.strip()
    summary = ""
    if "<<SUMMARY>>" in text:
        head, tail = text.split("<<SUMMARY>>", 1)
        summary = tail.strip()
        text = head.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    try:
        return json.loads(text), summary
    except Exception:
        return None, summary


def _check_roles(dsl: dict[str, Any], available_roles: list[dict[str, str]]) -> list[str]:
    """Reject any approval.assignee.role that isn't in the catalog. This is the
    last-line defense: even if the prompt warns the model, we double-check so
    a hallucinated role (e.g. 'student_affairs' instead of
    'student_affairs_officer') can never reach the database."""
    if not available_roles:
        return []
    valid = {r.get("code") for r in available_roles if r.get("code")}
    errs: list[str] = []
    for n in dsl.get("nodes") or []:
        if not isinstance(n, dict) or n.get("type") != "approval":
            continue
        role = (n.get("assignee") or {}).get("role")
        if role and role not in valid:
            available_codes = ", ".join(sorted(valid))
            errs.append(
                f"节点 {n.get('id', '?')} 使用了清单外的角色 '{role}'。"
                f"可用角色 code: [{available_codes}]。"
                f"请在清单中选择最接近的，或反问用户选哪个。"
            )
    return errs


def _check_refs(dsl: dict[str, Any]) -> list[str]:
    nodes = dsl.get("nodes") or []
    ids = {n.get("id") for n in nodes if isinstance(n, dict)}
    errs: list[str] = []
    if dsl.get("start") not in ids:
        errs.append(f"start='{dsl.get('start')}' 未在 nodes 中找到")
    for n in nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id", "?")
        t = n.get("type")
        def _ref(field: str, target: Any) -> None:
            if target and target not in ids:
                errs.append(f"节点 {nid}.{field} 引用了不存在的 id '{target}'")
        if t in ("form_submit", "notification"):
            _ref("next", n.get("next"))
        elif t == "approval":
            _ref("next", n.get("next"))
            _ref("rejected_next", n.get("rejected_next"))
        elif t == "condition":
            for i, b in enumerate(n.get("branches") or []):
                _ref(f"branches[{i}].next", (b or {}).get("next"))
        elif t == "publicity":
            _ref("next", n.get("next"))
            io = n.get("interrupt_on") or {}
            _ref("interrupt_on.next", io.get("next"))
    return errs


async def _generate_node(state: AuthorState) -> AuthorState:
    attempts = state.get("attempts") or []
    prev = attempts[-1] if attempts else None
    provider = DeepSeekProvider()
    messages = [
        ChatMessage(role="system", content=_system_prompt(state.get("available_roles") or [])),
        ChatMessage(role="user", content=_user_prompt(state["current_dsl"], state["instruction"], prev)),
    ]
    result = await provider.chat(messages, temperature=0.2, max_tokens=4000)
    dsl, summary = _split_json_and_summary(result.content)
    attempts = attempts + [{"dsl": dsl, "raw": result.content, "errors": [], "summary": summary}]
    return {"dsl": dsl, "summary": summary, "attempts": attempts}


def _validate_node(state: AuthorState) -> AuthorState:
    attempts = list(state.get("attempts") or [])
    if not attempts:
        return {"error_message": "no attempt produced"}
    last = attempts[-1]
    dsl = last.get("dsl")
    if dsl is None:
        last["errors"] = ["LLM 输出无法解析为 JSON"]
        attempts[-1] = last
        return {"attempts": attempts, "error_message": "output not json"}

    # Special path: model decided it needed user clarification (e.g. requested
    # a role that doesn't exist in the catalog). Surface the SUMMARY back to
    # the user verbatim — no DSL, no retry.
    if isinstance(dsl, dict) and dsl.get("need_clarification"):
        summary = state.get("summary") or "需要补充信息后才能修改流程。"
        return {
            "attempts": attempts,
            "dsl": None,
            "error_message": summary,
        }

    errors = [
        f"{'.'.join(str(p) for p in e.path) or '$'}: {e.message}"
        for e in sorted(_VALIDATOR.iter_errors(dsl), key=lambda e: list(e.path))
    ]
    if not errors:
        errors = _check_refs(dsl)
    if not errors:
        errors = _check_roles(dsl, state.get("available_roles") or [])
    last["errors"] = errors
    attempts[-1] = last
    return {
        "attempts": attempts,
        "error_message": None if not errors else "schema invalid",
    }


def _decide(state: AuthorState) -> str:
    if not state.get("error_message"):
        return "end"
    if len(state.get("attempts") or []) > MAX_RETRIES:
        return "end"
    return "retry"


def _build_graph():
    g = StateGraph(AuthorState)
    g.add_node("generate", _generate_node)
    g.add_node("validate", _validate_node)
    g.set_entry_point("generate")
    g.add_edge("generate", "validate")
    g.add_conditional_edges("validate", _decide, {"retry": "generate", "end": END})
    return g.compile()


_GRAPH = _build_graph()


async def run(
    current_dsl: dict[str, Any],
    instruction: str,
    available_roles: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Returns {dsl, summary, attempts, error_message}. dsl is valid iff error_message is None.

    available_roles is a list of {code, name} the AI may pick from for
    approval.assignee.role. Empty list means "no approvals allowed in output";
    the caller normally supplies the tenant's sys_role catalog.
    """
    if not instruction or not instruction.strip():
        return {"dsl": None, "summary": "", "attempts": [], "error_message": "empty instruction"}
    if not isinstance(current_dsl, dict) or not current_dsl.get("nodes"):
        return {"dsl": None, "summary": "", "attempts": [], "error_message": "empty current_dsl"}
    final: AuthorState = await _GRAPH.ainvoke(
        {
            "current_dsl": current_dsl,
            "instruction": instruction.strip(),
            "available_roles": available_roles or [],
            "attempts": [],
        }
    )
    err = final.get("error_message")
    return {
        "dsl": final.get("dsl") if not err else None,
        "summary": final.get("summary") or "",
        "attempts": [
            {"errors": a.get("errors", []), "dsl": a.get("dsl")}
            for a in (final.get("attempts") or [])
        ],
        "error_message": err,
    }
