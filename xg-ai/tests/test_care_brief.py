"""W3.4 单测：care_brief agent（PRD §11）。

覆盖：
- sanitize 5 分支（纯函数）+ blocked 留原文 / redacted 只剔违规条
- §11.3 schema：required / 类型 / follow_up_days 范围
- run() 契约：成功形态、空 context / LLM 不可用 / 解析失败降级、
  schema 不过重试、blocked 走成功路径不带 error_message（Java 需 ok()
  才能 §11.4 留痕 + §11.5 显示失败）
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from jsonschema import Draft7Validator

from app.agent.care_brief.graph import _SCHEMA, run
from app.agent.care_brief.sanitize import sanitize
from app.llm.provider import ChatResult

_VALIDATOR = Draft7Validator(_SCHEMA)


def _clean_brief() -> dict:
    return {
        "why": "最近未到课，了解一下近况",
        "talking_points": ["学习近况", "社团活动"],
        "avoid_topics": ["私人情感"],
        "campus_resources": ["学业辅导"],
        "follow_up_days": 7,
    }


# ───────────────────────── sanitize 5 分支 ─────────────────────────


def test_sanitize_clean_pass() -> None:
    b = _clean_brief()
    out, r = sanitize(b)
    assert r == "pass"
    assert out == b


def test_sanitize_hard_term_in_why_blocked() -> None:
    b = _clean_brief()
    b["why"] = "该生疑似存在心理风险"
    out, r = sanitize(b)
    assert r == "blocked"
    assert out == b  # blocked 原样返回，留痕用


def test_sanitize_hard_term_in_list_blocked() -> None:
    b = _clean_brief()
    b["campus_resources"] = ["心理危机干预中心"]
    _, r = sanitize(b)
    assert r == "blocked"


def test_sanitize_soft_term_in_why_blocked() -> None:
    b = _clean_brief()
    b["why"] = "你必须立刻找他谈"
    _, r = sanitize(b)
    assert r == "blocked"


def test_sanitize_soft_term_in_list_redacted_and_pruned() -> None:
    b = _clean_brief()
    b["talking_points"] = ["学习近况", "必须联系家长"]
    out, r = sanitize(b)
    assert r == "redacted"
    assert out["talking_points"] == ["学习近况"]  # 只剔违规条
    assert out["avoid_topics"] == b["avoid_topics"]  # 其它字段不动


# ───────────────────────── §11.3 schema ─────────────────────────


def test_schema_valid() -> None:
    assert not list(_VALIDATOR.iter_errors(_clean_brief()))


@pytest.mark.parametrize("missing", ["why", "talking_points", "follow_up_days"])
def test_schema_missing_required(missing: str) -> None:
    b = _clean_brief()
    del b[missing]
    assert list(_VALIDATOR.iter_errors(b))


@pytest.mark.parametrize("bad", ["7", 0, 31])
def test_schema_follow_up_days_bad(bad) -> None:
    b = _clean_brief()
    b["follow_up_days"] = bad
    assert list(_VALIDATOR.iter_errors(b))


def test_schema_rejects_extra_field() -> None:
    b = _clean_brief()
    b["risk_level"] = "high"  # additionalProperties:false
    assert list(_VALIDATOR.iter_errors(b))


# ───────────────────────── run() 契约 / 降级 ─────────────────────────

_CTX = {
    "trigger": {"rule_id": "R001"},
    "rule_id": "R001",
    "severity": "critical",
    "student": {"grade": "2023"},
    "recent_events": [],
    "recent_window_days": 30,
    "closed_care_summary": [],
}


def _patch_chat(side_effect=None, return_value=None):
    """patch graph.DeepSeekProvider，使 .chat 受控。"""
    p = patch("app.agent.care_brief.graph.DeepSeekProvider")
    mock_cls = p.start()
    chat = AsyncMock(side_effect=side_effect, return_value=return_value)
    mock_cls.return_value.chat = chat
    return p, chat


@pytest.mark.asyncio
async def test_run_empty_context_degrades() -> None:
    out = await run({})
    assert out == {"error_message": "empty context"}


@pytest.mark.asyncio
async def test_run_llm_unavailable_degrades() -> None:
    p, _ = _patch_chat(side_effect=RuntimeError("no api key"))
    try:
        out = await run(_CTX)
    finally:
        p.stop()
    assert "error_message" in out
    assert "llm unavailable" in out["error_message"]
    assert "why" not in out  # 不写 history → Java FAILED


@pytest.mark.asyncio
async def test_run_unparseable_twice_degrades() -> None:
    p, chat = _patch_chat(side_effect=[
        ChatResult(content="not json", model="m"),
        ChatResult(content="still not json", model="m"),
    ])
    try:
        out = await run(_CTX)
    finally:
        p.stop()
    assert out["error_message"] == "output not json"
    assert chat.await_count == 2  # 重试了一次


@pytest.mark.asyncio
async def test_run_success_shape() -> None:
    good = json.dumps(_clean_brief())
    p, _ = _patch_chat(return_value=ChatResult(content=good, model="deepseek-test"))
    try:
        out = await run(_CTX)
    finally:
        p.stop()
    assert "error_message" not in out
    assert out["why"] == "最近未到课，了解一下近况"
    assert out["sanitize_result"] == "pass"
    assert out["llm_model"] == "deepseek-test"
    assert set(out) == {
        "why", "talking_points", "avoid_topics",
        "campus_resources", "follow_up_days", "sanitize_result", "llm_model",
    }


@pytest.mark.asyncio
async def test_run_blocked_is_success_path() -> None:
    """硬词命中 → sanitize_result=blocked，但**不带 error_message**：
    Java 需 ok() 才能 §11.4 留痕 + §11.5 显示「建议生成失败」。"""
    bad = _clean_brief()
    bad["why"] = "该生疑似有心理危机"
    p, _ = _patch_chat(return_value=ChatResult(content=json.dumps(bad), model="m"))
    try:
        out = await run(_CTX)
    finally:
        p.stop()
    assert "error_message" not in out
    assert out["sanitize_result"] == "blocked"
    assert out["why"] == "该生疑似有心理危机"  # 留痕保留原文


@pytest.mark.asyncio
async def test_run_schema_retry_then_ok() -> None:
    """首轮缺 follow_up_days（schema 不过）→ 重试一次返回合法 → 成功。"""
    invalid = _clean_brief()
    del invalid["follow_up_days"]
    p, chat = _patch_chat(side_effect=[
        ChatResult(content=json.dumps(invalid), model="m"),
        ChatResult(content=json.dumps(_clean_brief()), model="m"),
    ])
    try:
        out = await run(_CTX)
    finally:
        p.stop()
    assert "error_message" not in out
    assert out["follow_up_days"] == 7
    assert chat.await_count == 2
