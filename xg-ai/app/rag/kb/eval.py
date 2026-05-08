"""Knowledge-base evaluation: run a labelled test set through the
retriever, compute document-level recall@K and MRR.

Public surface:
    list_cases(kb_id)
    create_case(kb_id, query, expected_doc_ids, note=None, created_by=None)
    delete_case(case_id)
    evaluate(kb_id, top_k=5) -> dict     # also persists snapshot to KB

Metric definitions (all "doc-level"):
    hit_rank   : the smallest 1-based rank in retriever hits whose
                 document_id ∈ expected_doc_ids. None if no overlap.
    passed     : hit_rank is not None
    reciprocal : 1/hit_rank if passed else 0
    recall@K   : mean(passed) across cases
    MRR        : mean(reciprocal) across cases
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.rag.kb import dao, retriever
from app.rag.kb.dao import _next_id, get_pool

logger = logging.getLogger(__name__)


# ---------------- Cases CRUD ----------------

async def list_cases(kb_id: int) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, kb_id, query, expected_doc_ids, note, created_at
              FROM kb_eval_case
             WHERE kb_id = $1
             ORDER BY id ASC
            """,
            kb_id,
        )
    return [dict(r) for r in rows]


async def create_case(
    kb_id: int, query: str, expected_doc_ids: list[int],
    note: str | None = None, created_by: int | None = None,
) -> int:
    case_id = _next_id()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO kb_eval_case
                (id, kb_id, query, expected_doc_ids, note, created_by)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
            """,
            case_id, kb_id, query.strip(),
            json.dumps([int(x) for x in expected_doc_ids]),
            note, created_by,
        )
    return case_id


async def delete_case(case_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM kb_eval_case WHERE id = $1", case_id,
        )
    return result.endswith(" 1")


# ---------------- Evaluation runner ----------------

async def evaluate(kb_id: int, top_k: int = 5) -> dict[str, Any]:
    kb = await dao.get_kb(kb_id)
    if not kb:
        raise ValueError(f"kb {kb_id} not found")

    cases = await list_cases(kb_id)
    if not cases:
        return _empty_result(top_k)

    per_case: list[dict[str, Any]] = []
    pass_count = 0
    rr_sum = 0.0

    for c in cases:
        expected_raw = c["expected_doc_ids"]
        # asyncpg returns JSONB as str on some configs, list on others.
        if isinstance(expected_raw, str):
            try:
                expected_raw = json.loads(expected_raw)
            except Exception:
                expected_raw = []
        expected = {int(x) for x in (expected_raw or [])}

        try:
            hits = await retriever.retrieve(kb, c["query"], top_k=top_k)
        except Exception:
            logger.exception("retrieve failed for case %s", c["id"])
            hits = []

        hit_rank = _first_match_rank(hits, expected)
        passed = hit_rank is not None
        if passed:
            pass_count += 1
            rr_sum += 1.0 / hit_rank

        per_case.append({
            "case_id": str(c["id"]),
            "query": c["query"],
            "expected_doc_ids": [str(x) for x in expected],
            "hits": [
                {
                    "document_id": str(h.get("document_id")),
                    "document_name": h.get("document_name"),
                    "rank": i + 1,
                    "score": float(h.get("score", 0.0)),
                }
                for i, h in enumerate(hits)
            ],
            "hit_rank": hit_rank,
            "passed": passed,
        })

    n = len(cases)
    summary = {
        "top_k": top_k,
        "total_cases": n,
        "passed_cases": pass_count,
        "recall_at_k": round(pass_count / n, 4),
        "mrr": round(rr_sum / n, 4),
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "per_case": per_case,
    }

    await _persist_snapshot(kb_id, summary)
    return summary


def _first_match_rank(hits: list[dict], expected: set[int]) -> int | None:
    if not expected:
        return None
    for i, h in enumerate(hits, start=1):
        try:
            if int(h.get("document_id")) in expected:
                return i
        except (TypeError, ValueError):
            continue
    return None


def _empty_result(top_k: int) -> dict[str, Any]:
    return {
        "top_k": top_k, "total_cases": 0, "passed_cases": 0,
        "recall_at_k": 0.0, "mrr": 0.0,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "per_case": [],
    }


async def _persist_snapshot(kb_id: int, summary: dict[str, Any]) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE knowledge_base
               SET last_eval_at = NOW(),
                   last_eval_result = $2::jsonb,
                   updated_at = NOW()
             WHERE id = $1
            """,
            kb_id, json.dumps(summary),
        )
