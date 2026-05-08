"""End-to-end ingest pipeline: parse → chunk → embed → upsert.

Synchronous for now; large files block the request. The kb_document row
goes through indexing_status: pending → processing → done | error so the
UI can show progress and we can later swap in a background queue."""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from app.rag.embedder import embed_passages
from app.rag.kb import dao
from app.rag.kb.chunker import split_text
from app.rag.kb.parsers import parse_to_text

logger = logging.getLogger(__name__)


async def ingest_file(
    kb_id: int, kb_config: dict[str, Any],
    filename: str, content: bytes,
    *, source_meta: dict[str, Any] | None = None,
    created_by: int | None = None,
) -> int:
    """Returns the new document id. The doc is left in 'done' or 'error'
    state by the time this returns."""
    file_hash = hashlib.sha256(content).hexdigest()
    doc_id = await dao.insert_document(
        kb_id=kb_id, name=filename, source_type="file",
        source_meta={**(source_meta or {}), "original_filename": filename},
        file_size_bytes=len(content), file_hash=file_hash,
        created_by=created_by,
    )
    try:
        await dao.update_document_status(doc_id, "processing")
        text = parse_to_text(filename, content)
        char_count = len(text)
        chunk_size = kb_config.get("chunk_size", 500)
        chunk_overlap = kb_config.get("chunk_overlap", 50)
        chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        if not chunks:
            await dao.update_document_status(
                doc_id, "done", char_count=char_count, chunk_count=0,
            )
            return doc_id

        # Embed all chunks in one batch and write back with vectors.
        vectors = embed_passages([c["content"] for c in chunks])
        for c, vec in zip(chunks, vectors, strict=False):
            c["embedding"] = vec
        await dao.upsert_chunks(document_id=doc_id, kb_id=kb_id, items=chunks)
        await dao.update_document_status(
            doc_id, "done", char_count=char_count, chunk_count=len(chunks),
        )
        return doc_id
    except Exception as e:
        logger.exception("ingest failed kb=%s doc=%s", kb_id, doc_id)
        await dao.update_document_status(doc_id, "error", error=str(e))
        return doc_id


async def ingest_text(
    kb_id: int, kb_config: dict[str, Any],
    name: str, text: str,
    *, source_type: str = "manual",
    source_meta: dict[str, Any] | None = None,
    created_by: int | None = None,
) -> int:
    """Direct text ingest — used by the legacy-doc migration and any
    'manual paste' upload path."""
    doc_id = await dao.insert_document(
        kb_id=kb_id, name=name, source_type=source_type,
        source_meta=source_meta,
        file_size_bytes=len(text.encode("utf-8")),
        file_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        created_by=created_by,
    )
    try:
        await dao.update_document_status(doc_id, "processing")
        chunks = split_text(
            text,
            chunk_size=kb_config.get("chunk_size", 500),
            chunk_overlap=kb_config.get("chunk_overlap", 50),
        )
        if not chunks:
            await dao.update_document_status(
                doc_id, "done", char_count=len(text), chunk_count=0,
            )
            return doc_id
        vectors = embed_passages([c["content"] for c in chunks])
        for c, vec in zip(chunks, vectors, strict=False):
            c["embedding"] = vec
        await dao.upsert_chunks(document_id=doc_id, kb_id=kb_id, items=chunks)
        await dao.update_document_status(
            doc_id, "done", char_count=len(text), chunk_count=len(chunks),
        )
        return doc_id
    except Exception as e:
        logger.exception("ingest_text failed kb=%s doc=%s", kb_id, doc_id)
        await dao.update_document_status(doc_id, "error", error=str(e))
        return doc_id
