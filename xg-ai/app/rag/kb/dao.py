"""asyncpg CRUD for the kb tables. Uses the same pool as store.py so we
inherit pgvector type registration without re-initialising connections."""
from __future__ import annotations

import json
import time
from typing import Any

import numpy as np

from app.rag.store import get_pool

# Snowflake-ish ID generator (timestamp-shifted + counter). We don't share
# the Java-side generator; sidecar inserts must just be unique within the
# kb_* tables. Bigint, monotonic-enough for this scale.
_id_counter = 0


def _next_id() -> int:
    global _id_counter
    _id_counter = (_id_counter + 1) & 0x3FF
    return (int(time.time() * 1000) << 12) | _id_counter


# ---------------- KnowledgeBase ----------------

async def create_kb(payload: dict[str, Any], created_by: int | None = None) -> int:
    kb_id = _next_id()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO knowledge_base
                (id, name, description, embedding_model, embedding_dim, rerank_model,
                 chunk_size, chunk_overlap, retrieval_mode, top_k, score_threshold, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
            kb_id,
            payload["name"],
            payload.get("description"),
            payload["embedding_model"],
            payload.get("embedding_dim", 1024),
            payload.get("rerank_model"),
            payload.get("chunk_size", 500),
            payload.get("chunk_overlap", 50),
            payload.get("retrieval_mode", "hybrid"),
            payload.get("top_k", 5),
            payload.get("score_threshold"),
            created_by,
        )
    return kb_id


async def list_kbs() -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT kb.*, COALESCE(stats.doc_count, 0) AS doc_count,
                   COALESCE(stats.chunk_count, 0) AS chunk_count
              FROM knowledge_base kb
              LEFT JOIN (
                SELECT kb_id,
                       COUNT(*) FILTER (WHERE deleted_at IS NULL) AS doc_count,
                       SUM(chunk_count) AS chunk_count
                  FROM kb_document
                 GROUP BY kb_id
              ) stats ON stats.kb_id = kb.id
             WHERE kb.deleted_at IS NULL
             ORDER BY kb.id
            """
        )
        return [dict(r) for r in rows]


async def get_kb(kb_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM knowledge_base WHERE id = $1 AND deleted_at IS NULL", kb_id
        )
        return dict(row) if row else None


async def update_kb(kb_id: int, patch: dict[str, Any]) -> bool:
    fields = []
    values: list[Any] = []
    for i, (k, v) in enumerate(patch.items(), start=2):
        fields.append(f"{k} = ${i}")
        values.append(v)
    if not fields:
        return False
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            f"UPDATE knowledge_base SET {', '.join(fields)}, updated_at = NOW() "
            f" WHERE id = $1 AND deleted_at IS NULL",
            kb_id, *values,
        )
        return result.endswith("UPDATE 1")


async def delete_kb(kb_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE knowledge_base SET deleted_at = NOW() WHERE id = $1", kb_id
        )
        return result.endswith("UPDATE 1")


# ---------------- Document ----------------

async def insert_document(
    kb_id: int, name: str, source_type: str,
    source_meta: dict | None = None,
    file_size_bytes: int | None = None,
    file_hash: str | None = None,
    created_by: int | None = None,
) -> int:
    doc_id = _next_id()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO kb_document
                (id, kb_id, name, source_type, source_meta, file_size_bytes, file_hash,
                 indexing_status, created_by)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'pending', $8)
            """,
            doc_id, kb_id, name, source_type,
            json.dumps(source_meta) if source_meta else None,
            file_size_bytes, file_hash, created_by,
        )
    return doc_id


async def list_documents(kb_id: int) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM kb_document
             WHERE kb_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC
            """,
            kb_id,
        )
        return [dict(r) for r in rows]


async def update_document_status(
    doc_id: int, status: str, *, error: str | None = None,
    char_count: int | None = None, chunk_count: int | None = None,
) -> None:
    # asyncpg fails to infer the type of $2 when it's used both as a value
    # for indexing_status (VARCHAR) and inside `CASE WHEN $2 = 'done'`
    # (text comparison). Pass the boolean separately so each $-arg has one
    # unambiguous type.
    is_done = status == "done"
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE kb_document
               SET indexing_status = $2,
                   indexing_error  = $3,
                   char_count      = COALESCE($4, char_count),
                   chunk_count     = COALESCE($5, chunk_count),
                   indexed_at      = CASE WHEN $6 THEN NOW() ELSE indexed_at END,
                   updated_at      = NOW()
             WHERE id = $1
            """,
            doc_id, status, error, char_count, chunk_count, is_done,
        )


async def delete_document(doc_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Hard delete chunks first (cascade does it but be explicit), then soft-delete doc
        await conn.execute("DELETE FROM kb_chunk WHERE document_id = $1", doc_id)
        await conn.execute(
            "UPDATE kb_document SET deleted_at = NOW() WHERE id = $1", doc_id
        )


# ---------------- Chunks ----------------

async def upsert_chunks(
    document_id: int, kb_id: int, items: list[dict[str, Any]],
) -> int:
    """items: [{chunk_index, content, metadata?, embedding(np.ndarray|None), char_count}]"""
    if not items:
        return 0
    pool = await get_pool()
    rows = []
    for it in items:
        rows.append((
            _next_id(),
            document_id, kb_id, it["chunk_index"], it["content"],
            json.dumps(it.get("metadata")) if it.get("metadata") else None,
            it.get("embedding"),
            it.get("char_count") or len(it["content"]),
        ))
    async with pool.acquire() as conn:
        # Wipe existing chunks for this document then bulk insert (simpler than
        # UPSERT keyed by (document_id, chunk_index)).
        await conn.execute("DELETE FROM kb_chunk WHERE document_id = $1", document_id)
        await conn.executemany(
            """
            INSERT INTO kb_chunk
              (id, document_id, kb_id, chunk_index, content, metadata, embedding, char_count)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
            """,
            rows,
        )
    return len(rows)


async def list_chunks(document_id: int, limit: int = 200) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, document_id, kb_id, chunk_index, content, metadata,
                   char_count, enabled, created_at
              FROM kb_chunk
             WHERE document_id = $1
             ORDER BY chunk_index
             LIMIT $2
            """,
            document_id, limit,
        )
        return [dict(r) for r in rows]


async def toggle_chunk(chunk_id: int, enabled: bool) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE kb_chunk SET enabled = $2, updated_at = NOW() WHERE id = $1",
            chunk_id, enabled,
        )
        return result.endswith("UPDATE 1")


# ---------------- Hit-test queries ----------------

async def vector_search(
    kb_id: int, query_vec: np.ndarray, top_k: int,
    score_threshold: float | None = None,
) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.document_id, d.name AS document_name, c.chunk_index,
                   c.content, (c.embedding <=> $2) AS distance
              FROM kb_chunk c
              JOIN kb_document d ON d.id = c.document_id
             WHERE c.kb_id = $1
               AND c.enabled = TRUE
               AND d.enabled = TRUE
               AND d.deleted_at IS NULL
               AND c.embedding IS NOT NULL
             ORDER BY c.embedding <=> $2
             LIMIT $3
            """,
            kb_id, query_vec, top_k,
        )
    out = []
    for r in rows:
        score = 1.0 - float(r["distance"])  # cosine similarity
        if score_threshold is not None and score < score_threshold:
            continue
        out.append({
            "chunk_id": r["id"],
            "document_id": r["document_id"],
            "document_name": r["document_name"],
            "chunk_index": r["chunk_index"],
            "content": r["content"],
            "score": score,
            "source": "vector",
        })
    return out


async def keyword_search(
    kb_id: int, query: str, top_k: int,
) -> list[dict[str, Any]]:
    """Postgres ts_rank-based BM25-ish search. Uses 'simple' analyser — no
    Chinese tokeniser at the DB level, so we tokenise on the application side
    by splitting into characters / bigrams when needed. For now plain English-
    style works fine for keyword fallback and most Chinese substring matches
    via plainto_tsquery."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT c.id, c.document_id, d.name AS document_name, c.chunk_index,
                   c.content,
                   ts_rank_cd(to_tsvector('simple', c.content),
                              plainto_tsquery('simple', $2)) AS rank
              FROM kb_chunk c
              JOIN kb_document d ON d.id = c.document_id
             WHERE c.kb_id = $1
               AND c.enabled = TRUE
               AND d.enabled = TRUE
               AND d.deleted_at IS NULL
               AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', $2)
             ORDER BY rank DESC
             LIMIT $3
            """,
            kb_id, query, top_k,
        )
    out = []
    for r in rows:
        out.append({
            "chunk_id": r["id"],
            "document_id": r["document_id"],
            "document_name": r["document_name"],
            "chunk_index": r["chunk_index"],
            "content": r["content"],
            "score": float(r["rank"]),
            "source": "keyword",
        })
    return out
