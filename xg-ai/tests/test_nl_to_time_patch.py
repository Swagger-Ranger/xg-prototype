"""Unit tests for §7.1.9 nl_to_time_patch tool.

Mocks both the LLM and the Java backend so tests run with zero IO. Covers:
  - happy path (clean LLM output → valid → backend POST → success message)
  - LLM returns invalid JSON
  - LLM picks an unknown leave-type code
  - LLM uses an op outside the allowlist
  - LLM dates are bad
  - empty input
  - backend rejects the draft
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.tool import leave_config_tools as nlp


CTX = {"user_id": "1", "tenant_id": "t1", "user_role": "school_admin"}


# ---------- helpers ----------

def _mock_state(codes: list[str]):
    return {
        "data": {
            "published": {
                "config": {
                    "leaveTypes": [{"code": c, "name": c} for c in codes],
                },
            },
        },
    }


def _llm_turn(content: str):
    """Build a fake DeepSeekTurn-shaped object with the given output text."""
    class Turn:
        text = content
        tool_calls: list = []
        finish_reason = "stop"
        assistant_message = {"role": "assistant", "content": content}
        usage = None
    return Turn()


# ---------- happy path ----------

@pytest.mark.asyncio
async def test_happy_path_creates_draft():
    llm_output = """{
        "type": "time",
        "name": "考试周（不允许事假）",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal]", "op": "disable"}],
        "note": "原文：考试周(5/15-6/15)禁事假"
    }"""
    backend_post = AsyncMock(return_value={"data": {"patchId": "11111111-1111-1111-1111-111111111111"}})

    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal", "sick_off_campus"]))), \
         patch.object(nlp, "_post_json", backend_post), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "考试周(5/15-6/15)禁事假"}, CTX)

    assert "已为你创建" in out
    assert "考试周" in out
    assert "11111111" in out
    backend_post.assert_called_once()
    body = backend_post.call_args.args[1]
    assert body["type"] == "time"
    assert body["scope"]["from"] == "2026-05-15"
    assert body["diff"][0]["op"] == "disable"


@pytest.mark.asyncio
async def test_happy_path_strips_markdown_fence():
    """LLMs sometimes wrap JSON in ```json ... ``` even when told not to."""
    llm_output = """```json
{
    "type": "time",
    "name": "迎评期",
    "scope": {"from": "2026-04-01", "to": "2026-04-30", "orgIds": null},
    "diff": [{"path": "leaveTypes[code=personal].approvalChain", "op": "elevate", "value": {"addRoles": ["student_affairs_director"]}}],
    "note": "原文：迎评期事假升一级"
}
```"""
    backend_post = AsyncMock(return_value={"data": {"patchId": "abc"}})

    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp, "_post_json", backend_post), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "迎评期事假升一级"}, CTX)

    assert "已为你创建" in out
    backend_post.assert_called_once()


# ---------- empty / missing input ----------

@pytest.mark.asyncio
async def test_empty_text_short_circuits():
    out = await nlp.nl_to_time_patch({"text": ""}, CTX)
    assert "请提供" in out


@pytest.mark.asyncio
async def test_missing_text_arg():
    out = await nlp.nl_to_time_patch({}, CTX)
    assert "请提供" in out


# ---------- tenant has no published config ----------

@pytest.mark.asyncio
async def test_no_leave_types_yet():
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state([]))):
        out = await nlp.nl_to_time_patch({"text": "考试周禁事假"}, CTX)
    assert "尚未初始化" in out


# ---------- LLM-side failures ----------

@pytest.mark.asyncio
async def test_llm_returns_garbage():
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn("不是 JSON 抱歉"))):
        out = await nlp.nl_to_time_patch({"text": "随便说几句"}, CTX)
    assert "不是合法 JSON" in out


@pytest.mark.asyncio
async def test_llm_explicitly_says_cant_parse():
    llm_output = '{"error": "无法理解时间范围"}'
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "随便说几句"}, CTX)
    assert "LLM 表示无法理解" in out


@pytest.mark.asyncio
async def test_llm_call_raises():
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(side_effect=RuntimeError("network"))):
        out = await nlp.nl_to_time_patch({"text": "考试周禁事假"}, CTX)
    assert "LLM 调用失败" in out
    assert "network" in out


# ---------- validation failures ----------

@pytest.mark.asyncio
async def test_validation_unknown_code():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=ghost]", "op": "disable"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "禁掉 ghost"}, CTX)
    assert "未知假别" in out
    assert "ghost" in out


@pytest.mark.asyncio
async def test_validation_unknown_op():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal]", "op": "tighten"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "tighten 一下"}, CTX)
    assert "op 不合法" in out


@pytest.mark.asyncio
async def test_validation_bad_date():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026/05/15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal]", "op": "disable"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "考试周"}, CTX)
    assert "scope.from" in out


@pytest.mark.asyncio
async def test_validation_from_after_to():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-06-15", "to": "2026-05-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal]", "op": "disable"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "x"}, CTX)
    assert "必须早于或等于" in out


@pytest.mark.asyncio
async def test_validation_replace_missing_value():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal].maxDays", "op": "replace"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "x"}, CTX)
    assert "必须带 value" in out


@pytest.mark.asyncio
async def test_validation_elevate_bad_value():
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal].approvalChain", "op": "elevate", "value": "学工部部长"}]
    }"""
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "x"}, CTX)
    assert "addRoles" in out


# ---------- backend failure ----------

@pytest.mark.asyncio
async def test_backend_rejects_draft():
    import httpx
    llm_output = """{
        "type": "time", "name": "x",
        "scope": {"from": "2026-05-15", "to": "2026-06-15", "orgIds": null},
        "diff": [{"path": "leaveTypes[code=personal]", "op": "disable"}]
    }"""
    err_response = httpx.Response(409, text="conflict")
    err = httpx.HTTPStatusError("c", request=httpx.Request("POST", "/x"), response=err_response)
    with patch.object(nlp, "_get_json", AsyncMock(return_value=_mock_state(["personal"]))), \
         patch.object(nlp, "_post_json", AsyncMock(side_effect=err)), \
         patch.object(nlp.DeepSeekProvider, "chat_native", AsyncMock(return_value=_llm_turn(llm_output))):
        out = await nlp.nl_to_time_patch({"text": "x"}, CTX)
    assert "HTTP 409" in out


# ---------- pure-function unit tests ----------

def test_strip_code_fence_strips_json_tag():
    assert nlp._strip_code_fence("```json\n{}\n```") == "{}"


def test_strip_code_fence_strips_plain_fence():
    assert nlp._strip_code_fence("```\n{}\n```") == "{}"


def test_path_re_accepts_chain_and_simple():
    assert nlp.PATH_RE.match("leaveTypes[code=personal]")
    assert nlp.PATH_RE.match("leaveTypes[code=personal].maxDays")
    assert nlp.PATH_RE.match("leaveTypes[code=sick_off_campus].approvalChain")


def test_path_re_rejects_wildcards_and_indices():
    assert not nlp.PATH_RE.match("leaveTypes[*].maxDays")
    assert not nlp.PATH_RE.match("leaveTypes[0]")
    assert not nlp.PATH_RE.match("notifications[code=x]")
