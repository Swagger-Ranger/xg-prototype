"""Semantic retriever backed by pgvector, with keyword fallback.

The public contract matches the legacy `knowledge.retrieve`: return a
`list[Article]` so `chat.py` and the eval harness treat both retrievers
interchangeably.

Behaviour:
1. Command-style queries (`帮我请假`, `我想销假`...) are filtered before
   hitting the store — booking flows shouldn't pull in policy text.
2. Embed the query with `embedder.embed_query`, look up top-k by cosine
   distance via `store.fetch_similar`.
3. Drop results whose cosine distance exceeds `max_distance` so clearly
   out-of-corpus questions (e.g. "谈恋爱", "推荐一本书") return [].
4. If pgvector is unreachable or empty, fall back to the in-process
   keyword `retrieve` so the sidecar stays functional during migrations.
"""
from __future__ import annotations

import logging
from typing import Sequence

from app.rag.embedder import embed_query
from app.rag.knowledge import (
    Article,
    _looks_like_command,
    retrieve as keyword_retrieve,
)
from app.rag.store import RetrievedChunk, fetch_similar

logger = logging.getLogger(__name__)

# Cosine distance cut-off tuned on bge-small-zh + this corpus:
#   in-corpus relevant hits: 0.31–0.55
#   out-of-corpus ("推荐一本书"/"谈恋爱"/"今天天气"): ≥ 0.61
# 0.60 is the clean gap; re-measure if corpus or model changes.
DEFAULT_MAX_DISTANCE = 0.60


def _chunks_to_articles(chunks: Sequence[RetrievedChunk]) -> list[Article]:
    return [
        Article(
            article_id=c.article_id,
            doc_id=c.doc_id,
            doc_title=c.doc_title,
            heading=c.heading,
            body=c.body,
        )
        for c in chunks
    ]


async def retrieve_semantic(
    query: str,
    k: int = 5,
    max_distance: float = DEFAULT_MAX_DISTANCE,
) -> list[Article]:
    if _looks_like_command(query):
        return []

    try:
        vec = embed_query(query)
    except Exception:
        logger.exception("embed_query failed; falling back to keyword retrieve")
        return keyword_retrieve(query, k)

    chunks = await fetch_similar(vec, k=k)
    if not chunks:
        # Empty store (pre-ingest) or DB error. Graceful fallback.
        return keyword_retrieve(query, k)

    filtered = [c for c in chunks if c.distance <= max_distance]
    return _chunks_to_articles(filtered)
