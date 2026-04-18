"""CLI: embed every article in ALL_ARTICLES and upsert into pgvector.

Run:  .venv/bin/python -m app.rag.ingest
     (override DB)  DATABASE_URL=postgresql://... python -m app.rag.ingest
"""
from __future__ import annotations

import asyncio
import sys

from app.rag.embedder import embed_passages
from app.rag.knowledge import ALL_ARTICLES
from app.rag.store import (
    close_pool,
    count_chunks,
    ensure_schema,
    upsert_chunks,
)


async def _run() -> int:
    print(f"[ingest] articles to embed: {len(ALL_ARTICLES)}")
    passages = [a.body for a in ALL_ARTICLES]
    vecs = embed_passages(passages)
    print(f"[ingest] embedded: shape={vecs.shape}, dtype={vecs.dtype}")

    await ensure_schema()
    rows = [
        {
            "article_id": a.article_id,
            "doc_id": a.doc_id,
            "doc_title": a.doc_title,
            "heading": a.heading,
            "body": a.body,
            "embedding": vecs[i],
        }
        for i, a in enumerate(ALL_ARTICLES)
    ]
    n = await upsert_chunks(rows)
    total = await count_chunks()
    print(f"[ingest] upserted={n}, rows_in_table={total}")
    await close_pool()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
