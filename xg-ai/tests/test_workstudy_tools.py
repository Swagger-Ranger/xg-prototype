"""Tests for the 3 work-study AI tools added in B.

Covers:
- TOOLS / HANDLERS registration parity
- role gating (student-only / staff-only)
- slot overlap math (the only non-trivial helper)
- handler dispatch via mocked _get_json (no real HTTP)
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.tool import query_tools as qt


# ----- registration -----


@pytest.mark.parametrize(
    "name",
    [
        "find_workstudy_positions_by_preference",
        "match_workstudy_positions_to_schedule",
        "summarize_workstudy_applicants",
    ],
)
def test_tool_is_registered(name: str) -> None:
    tool_names = {t["name"] for t in qt.TOOLS}
    assert name in tool_names
    assert name in qt.HANDLERS


def test_student_sees_student_tools_only() -> None:
    visible = {t["name"] for t in qt.tools_for_role("student")}
    assert "find_workstudy_positions_by_preference" in visible
    assert "match_workstudy_positions_to_schedule" in visible
    assert "summarize_workstudy_applicants" not in visible   # staff-only


def test_counselor_sees_summarize_but_not_student_tools() -> None:
    visible = {t["name"] for t in qt.tools_for_role("counselor")}
    assert "summarize_workstudy_applicants" in visible
    assert "find_workstudy_positions_by_preference" not in visible
    assert "match_workstudy_positions_to_schedule" not in visible


# ----- slot overlap helper -----


@pytest.mark.parametrize(
    "a,b,expected",
    [
        # Full overlap
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "mon", "start": "14:00", "end": "17:00"}, 180),
        # Partial overlap
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "mon", "start": "15:00", "end": "16:30"}, 90),
        # Different day
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "tue", "start": "14:00", "end": "17:00"}, 0),
        # Adjacent (touching but not overlapping)
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "mon", "start": "17:00", "end": "18:00"}, 0),
        # Disjoint
        ({"day": "mon", "start": "14:00", "end": "15:00"},
         {"day": "mon", "start": "16:00", "end": "17:00"}, 0),
        # Required fully inside free
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "mon", "start": "13:00", "end": "18:00"}, 180),
        # Bad time string → 0 (fail-soft)
        ({"day": "mon", "start": "14:00", "end": "17:00"},
         {"day": "mon", "start": "abc", "end": "17:00"}, 0),
    ],
)
def test_slot_overlap_minutes(a: dict, b: dict, expected: int) -> None:
    assert qt._slot_overlap_minutes(a, b) == expected


# ----- handler dispatch (mocked HTTP) -----


@pytest.mark.asyncio
async def test_find_by_preference_filters_by_keyword_and_rate() -> None:
    fake_positions = {
        "data": {"data": [
            {"id": 1, "title": "图书馆值班", "department_name": "图书馆",
             "campus": "本部", "salary_amount": 18, "position_type": "temporary",
             "hired_count": 0, "headcount": 2},
            {"id": 2, "title": "实验室助理", "department_name": "化学院",
             "campus": "本部", "salary_amount": 20, "position_type": "fixed",
             "hired_count": 0, "headcount": 1},
            {"id": 3, "title": "图书馆整理", "department_name": "图书馆",
             "campus": "新校区", "salary_amount": 12, "position_type": "temporary",
             "hired_count": 0, "headcount": 1},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake_positions)):
        out = await qt.find_workstudy_positions_by_preference(
            {"keyword": "图书馆", "min_rate": 15},
            {"user_id": "100", "tenant_id": "default", "user_role": "student"},
        )
    assert "图书馆值班" in out          # matches keyword + rate
    assert "图书馆整理" not in out      # rate too low
    assert "实验室助理" not in out      # keyword miss


@pytest.mark.asyncio
async def test_match_to_schedule_sorts_by_coverage() -> None:
    import json
    fake_positions = {
        "data": {"data": [
            {"id": 1, "title": "周一下午",
             "time_slots": json.dumps([{"day": "mon", "start": "14:00", "end": "17:00"}])},
            {"id": 2, "title": "周三全天",
             "time_slots": json.dumps([{"day": "wed", "start": "09:00", "end": "12:00"}])},
            {"id": 3, "title": "无时间要求", "time_slots": None},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake_positions)):
        out = await qt.match_workstudy_positions_to_schedule(
            {"free_slots": [{"day": "mon", "start": "13:00", "end": "18:00"}]},
            {"user_id": "100", "tenant_id": "default", "user_role": "student"},
        )
    # 周一下午 fully covered; 周三完全不能；无时间要求中间分
    lines = out.split("\n")
    body = "\n".join(lines[1:])
    assert body.index("周一下午") < body.index("无时间要求")
    assert body.index("无时间要求") < body.index("周三全天")
    assert "覆盖 100%" in out
    assert "覆盖 0%" in out


@pytest.mark.asyncio
async def test_match_to_schedule_requires_free_slots() -> None:
    out = await qt.match_workstudy_positions_to_schedule(
        {"free_slots": []},
        {"user_id": "100", "tenant_id": "default", "user_role": "student"},
    )
    assert "free_slots" in out


@pytest.mark.asyncio
async def test_summarize_applicants_groups_by_status() -> None:
    fake_apps = {
        "data": {"data": [
            {"id": 11, "student_id": 100, "student_name": "甲",
             "status": "pending", "financial_aid_level": "difficult",
             "intro": "希望参与", "created_at": "2026-04-01T08:00:00Z"},
            {"id": 12, "student_id": 101, "student_name": "乙",
             "status": "pending", "financial_aid_level": "none",
             "intro": "有相关经验", "created_at": "2026-04-02T09:00:00Z"},
            {"id": 13, "student_id": 102, "student_name": "丙",
             "status": "hired", "intro": "x", "created_at": "2026-03-30T10:00:00Z"},
            {"id": 14, "student_id": 103, "status": "rejected",
             "intro": "x", "created_at": "2026-03-29T10:00:00Z"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake_apps)):
        out = await qt.summarize_workstudy_applicants(
            {"position_id": 999},
            {"user_id": "1", "tenant_id": "default", "user_role": "counselor"},
        )
    assert "共 4 份" in out
    assert "审批中 2" in out
    assert "已录用 1" in out
    assert "已拒绝 1" in out
    assert "甲" in out and "乙" in out
    assert "困难" in out


@pytest.mark.asyncio
async def test_summarize_applicants_requires_position_id() -> None:
    out = await qt.summarize_workstudy_applicants(
        {}, {"user_id": "1", "tenant_id": "default", "user_role": "counselor"},
    )
    assert "position_id" in out


# =====================================================================
# Wave-2 tools (H)
# =====================================================================


@pytest.mark.parametrize(
    "name",
    [
        "detect_workstudy_salary_anomaly",
        "suggest_workstudy_position_template",
        "workstudy_dashboard_brief",
    ],
)
def test_wave2_tool_is_registered(name: str) -> None:
    tool_names = {t["name"] for t in qt.TOOLS}
    assert name in tool_names
    assert name in qt.HANDLERS


@pytest.mark.asyncio
async def test_detect_salary_anomaly_flagsHighOutlier() -> None:
    # Position #1 历史均值 ≈ 100，candidate 200 应被标 (>1.5x)
    history = {
        "data": {"data": [
            {"id": 100, "position_id": 1, "amount": 100, "month": "2026-01"},
            {"id": 101, "position_id": 1, "amount": 110, "month": "2026-02"},
            {"id": 102, "position_id": 1, "amount": 90,  "month": "2026-03"},
            {"id": 200, "position_id": 2, "amount": 50,  "month": "2026-01"},
            {"id": 201, "position_id": 2, "amount": 55,  "month": "2026-02"},
        ]}
    }
    candidates = {
        "data": {"data": [
            {"id": 999, "position_id": 1, "student_id": 50, "amount": 200, "month": "2026-04", "status": "pending"},
            {"id": 998, "position_id": 1, "student_id": 51, "amount": 105, "month": "2026-04", "status": "pending"},
            {"id": 997, "position_id": 2, "student_id": 52, "amount": 53,  "month": "2026-04", "status": "pending"},
        ]}
    }
    # First call returns candidates, second returns history (the function's call order)
    mock = AsyncMock(side_effect=[candidates, history])
    with patch.object(qt, "_get_json", mock):
        out = await qt.detect_workstudy_salary_anomaly(
            {"month": "2026-04", "threshold_factor": 1.5},
            {"user_id": "1", "tenant_id": "default", "user_role": "aid_center_officer"},
        )
    assert "异常" in out
    assert "#999" in out         # outlier flagged
    assert "#998" not in out     # within threshold
    assert "#997" not in out     # position 2 is normal


@pytest.mark.asyncio
async def test_detect_salary_anomaly_skipsPositionsWithThinHistory() -> None:
    history = {
        "data": {"data": [
            {"id": 1, "position_id": 5, "amount": 100, "month": "2026-01"},
            # only 1 sample for position 5 → cannot compute baseline → skip
        ]}
    }
    candidates = {
        "data": {"data": [
            {"id": 99, "position_id": 5, "student_id": 1, "amount": 9999, "month": "2026-04", "status": "pending"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(side_effect=[candidates, history])):
        out = await qt.detect_workstudy_salary_anomaly(
            {"month": "2026-04"},
            {"user_id": "1", "tenant_id": "default", "user_role": "aid_center_officer"},
        )
    assert "未发现" in out


@pytest.mark.asyncio
async def test_suggest_template_picks_modeAndAverage() -> None:
    fake = {
        "data": {"data": [
            {"position_type": "fixed", "salary_unit": "hour", "salary_amount": 18, "weekly_hours": 10, "headcount": 2, "campus": "本部"},
            {"position_type": "fixed", "salary_unit": "hour", "salary_amount": 20, "weekly_hours": 12, "headcount": 1, "campus": "本部"},
            {"position_type": "temporary", "salary_unit": "day", "salary_amount": 100, "weekly_hours": 8, "headcount": 3, "campus": "新校区"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.suggest_workstudy_position_template(
            {}, {"user_id": "1", "tenant_id": "default", "user_role": "student_affairs_officer"},
        )
    assert "固定岗" in out      # modal type
    assert "时" in out          # modal unit (hour → 时)
    assert "本部" in out        # modal campus


@pytest.mark.asyncio
async def test_dashboard_brief_student_shapesNumbers() -> None:
    pos = {"data": {"total": 7, "data": []}}
    my = {
        "data": {"data": [
            {"status": "pending"},
            {"status": "pending"},
            {"status": "hired"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(side_effect=[pos, my])):
        out = await qt.workstudy_dashboard_brief(
            {}, {"user_id": "100", "tenant_id": "default", "user_role": "student"},
        )
    assert "7" in out and "审批中 2" in out and "已录用 1" in out


@pytest.mark.asyncio
async def test_dashboard_brief_student_en_returnsEnglish() -> None:
    pos = {"data": {"total": 7, "data": []}}
    my = {"data": {"data": [{"status": "pending"}, {"status": "hired"}]}}
    with patch.object(qt, "_get_json", AsyncMock(side_effect=[pos, my])):
        out = await qt.workstudy_dashboard_brief(
            {},
            {"user_id": "100", "tenant_id": "default", "user_role": "student", "user_lang": "en"},
        )
    assert "positions you can apply" in out
    assert "submitted 2 applications" in out
    assert "1 pending, 1 hired" in out


@pytest.mark.asyncio
async def test_dashboard_brief_aidCenter_en_includesEnglishHint() -> None:
    pending = {"data": {"total": 5, "data": []}}
    confirmed = {"data": {"total": 100, "data": []}}
    with patch.object(qt, "_get_json", AsyncMock(side_effect=[pending, confirmed])):
        out = await qt.workstudy_dashboard_brief(
            {},
            {"user_id": "1", "tenant_id": "default", "user_role": "aid_center_officer", "user_lang": "en"},
        )
    assert "5 salary submissions" in out
    assert "100 already confirmed" in out
    assert "detect_workstudy_salary_anomaly" in out


def test_prompts_t_helper_falls_back_to_zh() -> None:
    from app.tool import workstudy_prompts as wp
    assert wp.t("FIND_HEADER", "zh").startswith("找到")
    assert wp.t("FIND_HEADER", "en").startswith("{n} matching")
    # missing EN entry → fall back to zh module-level
    assert wp.t("FIND_FOOTER", "en") == wp.FIND_FOOTER or wp.t("FIND_FOOTER", "en").startswith("(To check")
    # entirely unknown key → empty string, no exception
    assert wp.t("DOES_NOT_EXIST", "en") == ""


# ─── EN paths for the remaining 6 tools (Y2) ─────────────────────────


@pytest.mark.asyncio
async def test_find_by_preference_en() -> None:
    fake = {
        "data": {"data": [
            {"id": 1, "title": "Library Assistant", "department_name": "Library",
             "campus": "Main", "salary_amount": 18, "position_type": "temporary",
             "hired_count": 0, "headcount": 2, "salary_unit": "hour"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.find_workstudy_positions_by_preference(
            {"keyword": "library"},
            {"user_id": "1", "tenant_id": "default", "user_role": "student", "user_lang": "en"},
        )
    assert "matching positions" in out
    assert "Library Assistant" in out
    assert "temporary" in out
    assert "hr" in out
    assert "match_workstudy_positions_to_schedule" in out


@pytest.mark.asyncio
async def test_match_to_schedule_en_no_open() -> None:
    fake = {"data": {"data": []}}
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.match_workstudy_positions_to_schedule(
            {"free_slots": [{"day": "mon", "start": "14:00", "end": "17:00"}]},
            {"user_id": "1", "tenant_id": "default", "user_role": "student", "user_lang": "en"},
        )
    assert "No open positions" in out


@pytest.mark.asyncio
async def test_summarize_applicants_en() -> None:
    fake = {
        "data": {"data": [
            {"id": 11, "student_id": 100, "student_name": "Alice",
             "status": "pending", "financial_aid_level": "difficult",
             "intro": "Has experience.", "created_at": "2026-04-01T08:00:00Z"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.summarize_workstudy_applicants(
            {"position_id": 999},
            {"user_id": "1", "tenant_id": "default", "user_role": "counselor", "user_lang": "en"},
        )
    assert "Position #999" in out
    assert "1 total" in out
    assert "Alice" in out
    assert "difficult" in out


@pytest.mark.asyncio
async def test_detect_anomaly_en_no_data() -> None:
    fake = {"data": {"data": []}}
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.detect_workstudy_salary_anomaly(
            {"month": "2026-04"},
            {"user_id": "1", "tenant_id": "default", "user_role": "aid_center_officer", "user_lang": "en"},
        )
    assert "No salary submissions for 2026-04" in out


@pytest.mark.asyncio
async def test_suggest_template_en() -> None:
    fake = {
        "data": {"data": [
            {"position_type": "fixed", "salary_unit": "hour",
             "salary_amount": 18, "weekly_hours": 10, "headcount": 2, "campus": "Main"},
            {"position_type": "fixed", "salary_unit": "hour",
             "salary_amount": 20, "weekly_hours": 12, "headcount": 1, "campus": "Main"},
        ]}
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.suggest_workstudy_position_template(
            {}, {"user_id": "1", "tenant_id": "default",
                 "user_role": "student_affairs_officer", "user_lang": "en"},
        )
    assert "fixed-term" in out
    assert "Main" in out
    assert "median" in out


@pytest.mark.asyncio
async def test_draft_intro_en() -> None:
    fake = {
        "data": {
            "id": 42, "title": "Library Assistant",
            "position_type": "fixed", "department_name": "Library",
            "requirements": "careful, responsible",
            "campus": "Main", "work_location": "3F counter",
        }
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.draft_workstudy_application_intro(
            {"position_id": 42},
            {"user_id": "1", "tenant_id": "default", "user_role": "student", "user_lang": "en"},
        )
    assert "Dear Library hiring team" in out
    assert "Library Assistant" in out
    assert "(fixed-term)" in out
    assert "End of draft" in out
    assert "[" in out


@pytest.mark.asyncio
async def test_dashboard_brief_aidCenter_promptsAnomalyToolWhenPending() -> None:
    pending = {"data": {"total": 5, "data": []}}
    confirmed = {"data": {"total": 100, "data": []}}
    with patch.object(qt, "_get_json", AsyncMock(side_effect=[pending, confirmed])):
        out = await qt.workstudy_dashboard_brief(
            {}, {"user_id": "1", "tenant_id": "default", "user_role": "aid_center_officer"},
        )
    assert "5" in out and "100" in out
    assert "detect_workstudy_salary_anomaly" in out


# =====================================================================
# P: draft_workstudy_application_intro
# =====================================================================


def test_draft_intro_is_registered_for_student_only() -> None:
    names = {t["name"] for t in qt.TOOLS}
    assert "draft_workstudy_application_intro" in names
    assert "draft_workstudy_application_intro" in qt.HANDLERS
    visible_student = {t["name"] for t in qt.tools_for_role("student")}
    visible_counselor = {t["name"] for t in qt.tools_for_role("counselor")}
    assert "draft_workstudy_application_intro" in visible_student
    assert "draft_workstudy_application_intro" not in visible_counselor


@pytest.mark.asyncio
async def test_draft_intro_requires_position_id() -> None:
    out = await qt.draft_workstudy_application_intro(
        {}, {"user_id": "1", "tenant_id": "default", "user_role": "student"},
    )
    assert "position_id" in out


@pytest.mark.asyncio
async def test_draft_intro_404_returnsFriendlyMessage() -> None:
    with patch.object(qt, "_get_json", AsyncMock(return_value={"data": {}})):
        out = await qt.draft_workstudy_application_intro(
            {"position_id": 9999},
            {"user_id": "1", "tenant_id": "default", "user_role": "student"},
        )
    assert "找不到" in out or "无法" in out


@pytest.mark.asyncio
async def test_draft_intro_includesKeyFieldsAndTimePledge() -> None:
    import json
    fake = {
        "data": {
            "id": 42,
            "title": "图书馆值班",
            "position_type": "fixed",
            "department_name": "校图书馆",
            "requirements": "细心、有责任心、能熟练使用借阅系统",
            "campus": "本部",
            "work_location": "三层流通台",
            "time_slots": json.dumps([
                {"day": "mon", "start": "14:00", "end": "17:00"},
                {"day": "wed", "start": "14:00", "end": "17:00"},
            ]),
        }
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.draft_workstudy_application_intro(
            {"position_id": 42, "student_brief": "我是软件工程 2023 级李某某，家庭经济困难"},
            {"user_id": "1", "tenant_id": "default", "user_role": "student"},
        )
    assert "图书馆值班" in out
    assert "校图书馆" in out
    assert "周一" in out and "周三" in out                      # time slots rendered
    assert "家庭经济困难" in out                                  # aid pledge from brief
    assert "本部" in out and "三层流通台" in out                  # location
    assert "请按需修改" in out                                    # disclaimer present


@pytest.mark.asyncio
async def test_draft_intro_worksWithoutBriefAndRequirements() -> None:
    fake = {
        "data": {
            "id": 7,
            "title": "实验室助理",
            "position_type": "temporary",
            "employer_id": 5,
            "description": "整理样品、登记仪器使用记录",
        }
    }
    with patch.object(qt, "_get_json", AsyncMock(return_value=fake)):
        out = await qt.draft_workstudy_application_intro(
            {"position_id": 7},
            {"user_id": "1", "tenant_id": "default", "user_role": "student"},
        )
    assert "实验室助理" in out
    # falls back to description-based paragraph when requirements missing
    assert "整理样品" in out or "意愿" in out
    # employer fallback rendered
    assert "用人单位 #5" in out
