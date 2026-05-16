"""LangGraph-backed care brief agent（PRD §11）：结构化关怀上下文 → 中性 brief。

Graph（max_retries=1）：

    generate ──► validate ──► sanitize ──► END
       ▲             │
       └── schema 不过且 attempts ≤ max ─┘

§11.5 降级：LLM 不可用 / 解析失败 / 重试后仍不过 schema → 返回 error_message，
Java 侧不写 history、任务照常。sanitize=blocked **不是** error —— Java 需要
ok() 才能留痕并展示「建议生成失败」。

输入安全（§11.2）由 Java 侧 CareBriefContextBuilder 按构造保证，本 agent
只信任传入 context，不再拉取任何额外数据。
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, TypedDict

from jsonschema import Draft7Validator
from langgraph.graph import END, StateGraph

from app.agent.care_brief.sanitize import sanitize
from app.llm.deepseek import DeepSeekProvider
from app.llm.provider import ChatMessage

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).parent / "schema.json"
_SCHEMA = json.loads(_SCHEMA_PATH.read_text())
_VALIDATOR = Draft7Validator(_SCHEMA)

MAX_RETRIES = 1


class BriefState(TypedDict, total=False):
    context: dict[str, Any]
    brief: dict[str, Any] | None
    attempts: list[dict[str, Any]]  # each: {brief, errors, raw}
    error_message: str | None
    sanitize_result: str
    llm_model: str


def _system_prompt() -> str:
    return (
        "你是高校学生工作的辅助助手。辅导员准备就一名学生开展一次主动关怀谈话，"
        "你基于给定的结构化信息，输出一段帮助辅导员准备的 brief。\n\n"
        "## 立场与边界（必须严格遵守）\n"
        "- 只陈述事实，不做任何判断、推测或诊断。\n"
        "- 严禁出现「疑似」「高危」「心理风险」「危机」等诊断性 / 风险性词汇。\n"
        "- 严禁命令式表达：不写「必须」「应当」「请立即」「务必」。\n"
        "- 不预设辅导员的行动顺序，不写「该生需要」。\n"
        "- 不生成联系家长、转介心理、上报学校等决策性建议。\n"
        "- 话题保持中性、关心本人近况，不替学生下结论。\n\n"
        "## 输出 JSON Schema（严格遵守 required 与类型）\n"
        f"{json.dumps(_SCHEMA, ensure_ascii=False, indent=2)}\n\n"
        "## 输出规则\n"
        "- 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。\n"
        "- why：用一两句中性事实说明为何触发本次关怀，不带情绪色彩。\n"
        "- talking_points：可自然展开的中性话题；avoid_topics：本次不宜触碰的话题。\n"
        "- campus_resources：可主动提及的校内通用资源（如学业辅导、社团活动等）。\n"
        "- follow_up_days：建议的跟进间隔天数，1-30 的整数。\n"
    )


def _user_prompt(context: dict[str, Any], prev: dict | None) -> str:
    ctx = json.dumps(context, ensure_ascii=False, indent=2, default=str)
    if not prev:
        return f"结构化关怀上下文：\n{ctx}"
    errs = "\n".join(f"- {e}" for e in prev.get("errors", []))
    return (
        f"结构化关怀上下文：\n{ctx}\n\n"
        f"你上次返回的 JSON 有以下 schema 错误，请**只修复这些问题**重新输出完整 JSON：\n{errs}\n\n"
        f"上次的 JSON：\n{json.dumps(prev.get('brief') or {}, ensure_ascii=False, indent=2)}"
    )


def _extract_json(text: str) -> dict[str, Any] | None:
    """容忍多余的 ```json 围栏或前缀文字。"""
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
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


async def _generate_node(state: BriefState) -> BriefState:
    attempts = state.get("attempts") or []
    prev = attempts[-1] if attempts else None
    try:
        provider = DeepSeekProvider()
        messages = [
            ChatMessage(role="system", content=_system_prompt()),
            ChatMessage(role="user", content=_user_prompt(state["context"], prev)),
        ]
        result = await provider.chat(messages, temperature=0.3, max_tokens=1200)
    except Exception as e:  # 无 API key / 网络故障 → §11.5 降级
        logger.warning("care brief LLM call failed: %s", e)
        return {"error_message": f"llm unavailable: {e}", "brief": None}

    brief = _extract_json(result.content)
    attempts = attempts + [{"brief": brief, "raw": result.content, "errors": []}]
    return {"brief": brief, "attempts": attempts, "llm_model": result.model}


def _validate_node(state: BriefState) -> BriefState:
    if state.get("error_message"):  # generate 已降级，直接透传
        return {}
    attempts = list(state.get("attempts") or [])
    if not attempts:
        return {"error_message": "no attempt produced"}
    last = attempts[-1]
    brief = last.get("brief")
    if brief is None:
        last["errors"] = ["LLM output could not be parsed as JSON"]
        attempts[-1] = last
        return {"attempts": attempts, "error_message": "output not json"}
    errors = sorted(_VALIDATOR.iter_errors(brief), key=lambda e: list(e.path))
    last["errors"] = [
        f"{'.'.join(str(p) for p in e.path) or '$'}: {e.message}" for e in errors
    ]
    attempts[-1] = last
    return {
        "attempts": attempts,
        "error_message": None if not errors else "schema invalid",
    }


def _decide(state: BriefState) -> str:
    if not state.get("error_message"):
        return "ok"
    if state.get("brief") is None and "llm unavailable" in (state.get("error_message") or ""):
        return "fail"  # LLM 本身挂了，重试无意义
    if len(state.get("attempts") or []) > MAX_RETRIES:
        return "fail"
    return "retry"


def _sanitize_node(state: BriefState) -> BriefState:
    brief = state.get("brief") or {}
    cleaned, result = sanitize(brief)
    return {"brief": cleaned, "sanitize_result": result}


def _build_graph():
    g = StateGraph(BriefState)
    g.add_node("generate", _generate_node)
    g.add_node("validate", _validate_node)
    g.add_node("sanitize", _sanitize_node)
    g.set_entry_point("generate")
    g.add_edge("generate", "validate")
    g.add_conditional_edges(
        "validate", _decide, {"retry": "generate", "fail": END, "ok": "sanitize"}
    )
    g.add_edge("sanitize", END)
    return g.compile()


_GRAPH = _build_graph()

_OUTPUT_FIELDS = ("why", "talking_points", "avoid_topics", "campus_resources", "follow_up_days")


async def run(context: dict[str, Any]) -> dict[str, Any]:
    """成功 → {5 字段, sanitize_result, llm_model}；失败 → {error_message}。

    blocked 走成功路径（Java 需 ok() 才能 §11.4 留痕 + §11.5 显示失败）。
    """
    if not context:
        return {"error_message": "empty context"}
    final: BriefState = await _GRAPH.ainvoke({"context": context, "attempts": []})

    if final.get("error_message"):
        return {"error_message": final["error_message"]}

    brief = final.get("brief") or {}
    out: dict[str, Any] = {f: brief.get(f) for f in _OUTPUT_FIELDS}
    out["sanitize_result"] = final.get("sanitize_result", "pass")
    out["llm_model"] = final.get("llm_model", "unknown")
    return out
