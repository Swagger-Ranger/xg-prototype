"""Locks ZH/EN locale paths in chat.py so future edits don't regress.

We don't drive a full /chat round-trip here (that needs the LLM); instead we
exercise the deterministic helpers (_pick, _action_reply) which carry the bulk
of the user-visible localized text.
"""

from app.api.chat import (
    ActionPayload,
    _action_reply,
    _pick,
    _PAGE_LABELS_EN,
    _PAGE_LABELS_ZH,
    _ROLE_LABELS_EN,
    _ROLE_LABELS_ZH,
    _SYSTEM_PROMPT_EN,
    _SYSTEM_PROMPT_ZH,
)


def test_pick_picks_en_only_when_lang_is_en():
    assert _pick("中", "EN", "en") == "EN"
    assert _pick("中", "EN", "zh") == "中"
    assert _pick("中", "EN", "fr") == "中"  # unknown → zh fallback
    assert _pick("中", "EN", "") == "中"


def test_system_prompts_have_today_placeholder_in_both_langs():
    assert "{today}" in _SYSTEM_PROMPT_ZH
    assert "{today}" in _SYSTEM_PROMPT_EN


def test_role_label_dicts_share_keys():
    assert set(_ROLE_LABELS_ZH) == set(_ROLE_LABELS_EN)
    assert _ROLE_LABELS_EN["student"] == "student"
    assert _ROLE_LABELS_ZH["student"] == "学生"


def test_page_label_dicts_share_keys():
    assert set(_PAGE_LABELS_ZH) == set(_PAGE_LABELS_EN)
    assert _PAGE_LABELS_EN["leave"] == "Leave"
    assert _PAGE_LABELS_ZH["leave"] == "请销假"


def test_action_reply_navigate_localizes_page_label():
    a = ActionPayload(type="navigate", data={"page": "leave"})
    assert "请销假" in _action_reply(a, "zh")
    en = _action_reply(a, "en")
    assert "Leave" in en and "navigating" in en


def test_action_reply_open_leave_form_with_reason():
    a = ActionPayload(type="open_leave_form", data={"reason": "family"})
    assert "事由：family" in _action_reply(a, "zh")
    assert "reason pre-filled: family" in _action_reply(a, "en")


def test_action_reply_filter_students_joins_with_locale_separator():
    a = ActionPayload(type="filter_students", data={
        "grade": "2024级", "status": "active", "keyword": "wang",
    })
    zh = _action_reply(a, "zh")
    en = _action_reply(a, "en")
    # zh joins with 、; en joins with comma+space
    assert "2024级、在读" in zh
    assert "2024级, active" in en
    assert "keyword «wang»" in en


def test_action_reply_filter_students_empty_clears():
    a = ActionPayload(type="filter_students", data={})
    assert "（清空过滤）" in _action_reply(a, "zh")
    assert "(filters cleared)" in _action_reply(a, "en")


def test_action_reply_unknown_falls_back_to_generic():
    a = ActionPayload(type="weird_unknown_type")
    assert _action_reply(a, "zh") == "操作已执行。"
    assert _action_reply(a, "en") == "Action executed."


def test_action_reply_default_lang_is_zh():
    a = ActionPayload(type="open_checkin_form")
    # default param when lang omitted
    assert _action_reply(a) == "好的，已为您打开创建签到活动表单。"
