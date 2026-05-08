"""Semantic retriever — thin compatibility wrapper over the KB system.

`retrieve_semantic` keeps its `list[Article]` contract so `chat.py` and
`task_recommendation.py` can stay unchanged while the actual retrieval
runs through the new KB (`app.rag.kb.retriever`) against the default
KB (id=1, 校规制度), honouring per-KB mode/top_k/threshold/rerank.

Command-style queries (`帮我请假`, `我想销假`...) still short-circuit
to [] so booking flows don't pull in policy text. On any failure, fall
back to the in-process keyword retriever from the legacy hardcoded
corpus so the sidecar keeps responding even before/while KB is empty.
"""
from __future__ import annotations

import logging

from app.rag.kb import dao as kb_dao
from app.rag.kb import retriever as kb_retriever
from app.rag.knowledge import (
    Article,
    _looks_like_command,
    retrieve as keyword_retrieve,
)

logger = logging.getLogger(__name__)

DEFAULT_KB_ID = 1

# Cosine similarity floor applied to the chat path when a KB has no
# explicit threshold configured. 0.40 ≈ 0.60 distance — the same gap
# the legacy retriever used to drop off-topic queries (e.g. "今天天气
# 怎么样") so they don't pollute the system prompt.
CHAT_DEFAULT_THRESHOLD = 0.40


def _row_to_article(row: dict) -> Article:
    return Article(
        article_id=str(row.get("chunk_id") or ""),
        doc_id=str(row.get("document_id") or ""),
        doc_title=row.get("document_name") or "",
        heading="",
        body=row.get("content") or "",
    )


async def retrieve_semantic(query: str, k: int = 5) -> list[Article]:
    if _looks_like_command(query):
        return []

    try:
        kb = await kb_dao.get_kb(DEFAULT_KB_ID)
        if not kb:
            return keyword_retrieve(query, k)
        if kb.get("score_threshold") in (None, 0):
            kb = {**kb, "score_threshold": CHAT_DEFAULT_THRESHOLD}
        rows = await kb_retriever.retrieve(kb, query, top_k=k)
    except Exception:
        logger.exception("KB retrieve failed; falling back to keyword retrieve")
        return keyword_retrieve(query, k)

    if not rows:
        return []
    return [_row_to_article(r) for r in rows]
