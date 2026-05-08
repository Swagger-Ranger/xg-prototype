"""One-shot import of the legacy hardcoded docs in app.rag.knowledge.ALL_DOCS
into the default KB (id=1). Idempotent: skips when the default KB already
has documents.

Triggered from app.main on startup so a fresh deploy gets the校规 content
in the new RAG management surface without manual steps."""
from __future__ import annotations

import logging

from app.rag.kb import dao, ingest
from app.rag.knowledge import ALL_DOCS

logger = logging.getLogger(__name__)

DEFAULT_KB_ID = 1


async def seed_legacy_docs_if_empty() -> None:
    kb = await dao.get_kb(DEFAULT_KB_ID)
    if not kb:
        logger.warning("default KB id=%s missing; skip legacy seed", DEFAULT_KB_ID)
        return

    existing = await dao.list_documents(DEFAULT_KB_ID)
    if existing:
        logger.info("default KB already has %d docs; skip legacy seed", len(existing))
        return

    logger.info("seeding %d legacy docs into default KB", len(ALL_DOCS))
    for doc in ALL_DOCS:
        try:
            await ingest.ingest_text(
                kb_id=DEFAULT_KB_ID,
                kb_config={
                    "chunk_size": kb.get("chunk_size", 500),
                    "chunk_overlap": kb.get("chunk_overlap", 50),
                },
                name=doc.title,
                text=doc.body,
                source_type="manual",
                source_meta={"legacy_doc_id": doc.doc_id, "keywords": list(doc.keywords)},
            )
        except Exception:
            logger.exception("legacy seed failed for %s", doc.doc_id)
