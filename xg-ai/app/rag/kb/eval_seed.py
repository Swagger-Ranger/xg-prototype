"""Seed a starter eval set on the default KB so the admin lands on a
non-empty 评估 tab.

Idempotent: only inserts when the default KB has zero cases. Doc IDs
are resolved by name at runtime (snowflake IDs differ per environment).
"""
from __future__ import annotations

import logging

from app.rag.kb import dao, eval as eval_mod
from app.rag.kb.dao import get_pool

logger = logging.getLogger(__name__)

DEFAULT_KB_ID = 1

# Seed cases: each entry is (query, [doc_name_substrings_that_must_be_hit]).
# Doc names matched by substring so legacy seed renames don't break this.
SEED_CASES: list[tuple[str, list[str]]] = [
    ("请假超过3天怎么审批",          ["请假"]),
    ("病假请假需要什么证明",          ["请假"]),
    ("一学期累计请假最多多少天",       ["请假"]),
    ("夜不归宿怎么处理",             ["宿舍", "请假"]),
    ("宿舍能用大功率电器吗",          ["宿舍"]),
    ("本科生休学最长几年",           ["学籍"]),
    ("国家奖学金 GPA 要求",          ["奖学金"]),
    ("家庭经济困难学生怎么申请助学金",  ["资助"]),
]


async def seed_default_eval_cases_if_empty() -> None:
    try:
        existing = await eval_mod.list_cases(DEFAULT_KB_ID)
    except Exception:
        logger.exception("failed to list eval cases; skipping seed")
        return
    if existing:
        return

    docs = await dao.list_documents(DEFAULT_KB_ID)
    if not docs:
        logger.info("default KB has no docs; skipping eval seed")
        return

    inserted = 0
    for query, name_hints in SEED_CASES:
        expected_ids = [
            int(d["id"]) for d in docs
            if any(hint in (d.get("name") or "") for hint in name_hints)
        ]
        if not expected_ids:
            logger.warning("no doc match for seed case '%s'; skipping", query)
            continue
        try:
            await eval_mod.create_case(
                DEFAULT_KB_ID, query, expected_ids,
                note="系统初始用例", created_by=None,
            )
            inserted += 1
        except Exception:
            logger.exception("failed to insert seed case '%s'", query)

    logger.info("seeded %d default eval cases", inserted)
