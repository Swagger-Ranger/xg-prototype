"""pgvector-backed store for institutional knowledge articles.

Schema lives on `public` — knowledge is cross-tenant and read-only for
sidecar. Each article is a row keyed by `article_id`; `embedding` is
written once by the ingest CLI and queried via cosine distance.

`fetch_similar()` is the one call path reached by `chat.py`; a failure
there logs and returns [] so the caller can fall back to keyword.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS knowledge_chunk (
    article_id  TEXT PRIMARY KEY,
    doc_id      TEXT NOT NULL,
    doc_title   TEXT NOT NULL,
    heading     TEXT NOT NULL,
    body        TEXT NOT NULL,
    embedding   vector({dim}) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_idx
    ON knowledge_chunk USING hnsw (embedding vector_cosine_ops);
"""


@dataclass
class RetrievedChunk:
    article_id: str
    doc_id: str
    doc_title: str
    heading: str
    body: str
    distance: float  # cosine distance; 0 = identical, 2 = opposite


_pool: asyncpg.Pool | None = None


def _db_url() -> str:
    # asyncpg requires the `postgresql://` scheme; sidecar's DATABASE_URL
    # already uses it.
    return settings.database_url


async def _init_conn(conn: asyncpg.Connection) -> None:
    await register_vector(conn)


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=_db_url(),
            min_size=1,
            max_size=4,
            init=_init_conn,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def ensure_schema() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(DDL.format(dim=settings.embedding_dim))


async def upsert_chunks(rows: list[dict]) -> int:
    """Insert/update a batch of articles with their embeddings.

    Each row: {article_id, doc_id, doc_title, heading, body, embedding(np.ndarray)}
    """
    if not rows:
        return 0
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO knowledge_chunk
                (article_id, doc_id, doc_title, heading, body, embedding, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (article_id) DO UPDATE SET
                doc_id = EXCLUDED.doc_id,
                doc_title = EXCLUDED.doc_title,
                heading = EXCLUDED.heading,
                body = EXCLUDED.body,
                embedding = EXCLUDED.embedding,
                updated_at = now()
            """,
            [
                (
                    r["article_id"], r["doc_id"], r["doc_title"],
                    r["heading"], r["body"], r["embedding"],
                )
                for r in rows
            ],
        )
    return len(rows)


async def fetch_similar(query_vec, k: int = 5) -> list[RetrievedChunk]:
    """Return top-k chunks by cosine distance. `query_vec` is np.ndarray."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT article_id, doc_id, doc_title, heading, body,
                       embedding <=> $1 AS distance
                FROM knowledge_chunk
                ORDER BY embedding <=> $1
                LIMIT $2
                """,
                query_vec, k,
            )
    except Exception:
        logger.exception("pgvector fetch_similar failed")
        return []
    return [
        RetrievedChunk(
            article_id=r["article_id"],
            doc_id=r["doc_id"],
            doc_title=r["doc_title"],
            heading=r["heading"],
            body=r["body"],
            distance=float(r["distance"]),
        )
        for r in records
    ]


async def count_chunks() -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT COUNT(*)::int AS n FROM knowledge_chunk")
        return int(row["n"] or 0)
