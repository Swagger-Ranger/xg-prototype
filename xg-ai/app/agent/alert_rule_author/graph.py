"""LangGraph-backed alert rule authoring agent: natural language → DSL JSON.

Graph shape (max_retries=1):
        generate ──► validate ──► END (when valid)
           ▲            │
           └── on error (attempts < max) ──┘
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, TypedDict

from jsonschema import Draft7Validator
from langgraph.graph import END, StateGraph

from app.agent.alert_rule_author.catalog import CATALOG_TEXT
from app.llm.deepseek import DeepSeekProvider
from app.llm.provider import ChatMessage

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent / "schema.json"
_SCHEMA = json.loads(_SCHEMA_PATH.read_text())
_VALIDATOR = Draft7Validator(_SCHEMA)

MAX_RETRIES = 1


class AuthorState(TypedDict, total=False):
    nl: str
    dsl: dict[str, Any] | None
    attempts: list[dict[str, Any]]  # each: {dsl, errors, raw}
    error_message: str | None


def _system_prompt() -> str:
    return (
        "你是告警规则编写专家。用户用自然语言描述学生异常行为的预警规则，"
        "你输出一段**纯 JSON**（不要 markdown 代码块、不要任何解释文字），符合下面的 DSL 规范。\n\n"
        f"## 维度和字段目录\n{CATALOG_TEXT}\n\n"
        "## JSON Schema (必须严格遵守 required 字段和枚举值)\n"
        f"{json.dumps(_SCHEMA, ensure_ascii=False, indent=2)}\n\n"
        "## 输出规则\n"
        "- 只输出一个 JSON 对象，顶层键直接是 name/window/aggregations/condition/severity 等\n"
        "- severity 是 0-10 整数：提醒级 1-3，中等 4-6，严重 7-8，紧急 9-10\n"
        "- aggregation 的 alias 用小写英文下划线，要和 condition 里的引用一致\n"
        "- window 缺省给 rolling 30 天\n"
    )


def _user_prompt(nl: str, prev_attempt: dict | None) -> str:
    if not prev_attempt:
        return f"自然语言规则描述:\n{nl}"
    errs = "\n".join(f"- {e}" for e in prev_attempt.get("errors", []))
    return (
        f"自然语言规则描述:\n{nl}\n\n"
        f"你上次返回的 JSON 有以下 schema 错误，请**只修复这些问题**重新输出完整 JSON:\n{errs}\n\n"
        f"上次的 JSON:\n{json.dumps(prev_attempt.get('dsl') or {}, ensure_ascii=False, indent=2)}"
    )


def _extract_json(text: str) -> dict[str, Any] | None:
    """Tolerate stray ```json fences or leading prose."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    try:
        return json.loads(text)
    except Exception:
        return None


async def _generate_node(state: AuthorState) -> AuthorState:
    attempts = state.get("attempts") or []
    prev = attempts[-1] if attempts else None
    provider = DeepSeekProvider()
    messages = [
        ChatMessage(role="system", content=_system_prompt()),
        ChatMessage(role="user", content=_user_prompt(state["nl"], prev)),
    ]
    result = await provider.chat(messages, temperature=0.2, max_tokens=2000)
    dsl = _extract_json(result.content)
    attempts = attempts + [{"dsl": dsl, "raw": result.content, "errors": []}]
    return {"dsl": dsl, "attempts": attempts}


def _validate_node(state: AuthorState) -> AuthorState:
    attempts = list(state.get("attempts") or [])
    if not attempts:
        return {"error_message": "no attempt produced"}
    last = attempts[-1]
    dsl = last.get("dsl")
    if dsl is None:
        last["errors"] = ["LLM output could not be parsed as JSON"]
        attempts[-1] = last
        return {"attempts": attempts, "error_message": "output not json"}
    errors = sorted(_VALIDATOR.iter_errors(dsl), key=lambda e: list(e.path))
    last["errors"] = [f"{'.'.join(str(p) for p in e.path) or '$'}: {e.message}" for e in errors]
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


async def run(nl: str, *, trace_id: str | None = None) -> dict[str, Any]:
    """Returns {dsl, attempts, error_message}. dsl is valid iff error_message is None."""
    if not nl or not nl.strip():
        return {"dsl": None, "attempts": [], "error_message": "empty nl"}
    from app.observability.langfuse import get_callbacks
    config = {"callbacks": get_callbacks(session_id=trace_id, agent="alert_rule_author")}
    final: AuthorState = await _GRAPH.ainvoke({"nl": nl.strip(), "attempts": []}, config=config)
    return {
        "dsl": final.get("dsl") if not final.get("error_message") else None,
        "attempts": [
            {"errors": a.get("errors", []), "dsl": a.get("dsl")}
            for a in (final.get("attempts") or [])
        ],
        "error_message": final.get("error_message"),
    }
