"""KB management endpoints — backs the /system 「知识库」 admin UI.

Naming convention deliberately echoes Dify's structure (knowledge bases
contain documents which contain chunks) so the mental model carries over
for anyone familiar with that tool.

All routes are mounted under /api/v1 by main.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.rag.kb import dao, eval as eval_mod, ingest, retriever
from app.rag.kb.schemas import (
    EvalCaseCreateRequest,
    EvalRunRequest,
    HitTestRequest,
    HitTestResult,
    KbCreateRequest,
    KbUpdateRequest,
)

router = APIRouter(prefix="/kb", tags=["knowledge-base"])
logger = logging.getLogger(__name__)


# ----------- KnowledgeBase -----------

@router.get("")
async def list_kbs() -> list[dict[str, Any]]:
    rows = await dao.list_kbs()
    return [_serialise_kb(r) for r in rows]


@router.post("")
async def create_kb(
    payload: KbCreateRequest,
    x_user_id: str = Header(default=""),
) -> dict[str, Any]:
    user_id = _parse_user_id(x_user_id)
    kb_id = await dao.create_kb(payload.model_dump(), created_by=user_id)
    kb = await dao.get_kb(kb_id)
    return _serialise_kb(kb or {})


@router.get("/{kb_id}")
async def get_kb(kb_id: int) -> dict[str, Any]:
    kb = await dao.get_kb(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="kb not found")
    return _serialise_kb(kb)


@router.patch("/{kb_id}")
async def update_kb(
    kb_id: int, payload: KbUpdateRequest,
) -> dict[str, Any]:
    patch = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="empty patch")
    if not await dao.update_kb(kb_id, patch):
        raise HTTPException(status_code=404, detail="kb not found")
    kb = await dao.get_kb(kb_id)
    return _serialise_kb(kb or {})


@router.delete("/{kb_id}")
async def delete_kb(kb_id: int) -> dict[str, str]:
    if not await dao.delete_kb(kb_id):
        raise HTTPException(status_code=404, detail="kb not found")
    return {"status": "ok"}


# ----------- Documents -----------

@router.get("/{kb_id}/documents")
async def list_documents(kb_id: int) -> list[dict[str, Any]]:
    rows = await dao.list_documents(kb_id)
    return [_serialise_doc(r) for r in rows]


@router.post("/{kb_id}/documents")
async def upload_document(
    kb_id: int,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    x_user_id: str = Header(default=""),
) -> dict[str, Any]:
    kb = await dao.get_kb(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="kb not found")
    user_id = _parse_user_id(x_user_id)
    content = await file.read()
    filename = name or file.filename or "untitled"
    try:
        doc_id = await ingest.ingest_file(
            kb_id=kb_id, kb_config=kb,
            filename=filename, content=content,
            source_meta={"original_filename": file.filename, "mime_type": file.content_type},
            created_by=user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    docs = await dao.list_documents(kb_id)
    doc = next((d for d in docs if d["id"] == doc_id), None)
    return _serialise_doc(doc or {"id": doc_id, "kb_id": kb_id, "name": filename})


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int) -> dict[str, str]:
    await dao.delete_document(doc_id)
    return {"status": "ok"}


# ----------- Chunks -----------

@router.get("/documents/{doc_id}/chunks")
async def list_chunks(doc_id: int) -> list[dict[str, Any]]:
    rows = await dao.list_chunks(doc_id)
    return [_serialise_chunk(r) for r in rows]


@router.patch("/chunks/{chunk_id}")
async def patch_chunk(chunk_id: int, payload: dict) -> dict[str, str]:
    enabled = bool(payload.get("enabled", True))
    if not await dao.toggle_chunk(chunk_id, enabled):
        raise HTTPException(status_code=404, detail="chunk not found")
    return {"status": "ok"}


# ----------- Hit test -----------

@router.post("/{kb_id}/hit-test", response_model=list[HitTestResult])
async def hit_test(kb_id: int, req: HitTestRequest) -> list[HitTestResult]:
    kb = await dao.get_kb(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="kb not found")
    if not (req.query or "").strip():
        raise HTTPException(status_code=400, detail="query is required")
    rows = await retriever.retrieve(
        kb, req.query.strip(),
        mode=req.mode, top_k=req.top_k,
    )
    return [HitTestResult(**_pick(r, [
        "chunk_id", "document_id", "document_name",
        "chunk_index", "content", "score", "source",
    ])) for r in rows]


# ----------- Eval -----------

@router.get("/{kb_id}/eval/cases")
async def list_eval_cases(kb_id: int) -> list[dict[str, Any]]:
    rows = await eval_mod.list_cases(kb_id)
    return [_serialise_case(r) for r in rows]


@router.post("/{kb_id}/eval/cases")
async def create_eval_case(
    kb_id: int, payload: EvalCaseCreateRequest,
    x_user_id: str = Header(default=""),
) -> dict[str, Any]:
    if not (payload.query or "").strip():
        raise HTTPException(status_code=400, detail="query is required")
    if not payload.expected_doc_ids:
        raise HTTPException(status_code=400, detail="expected_doc_ids is required")
    case_id = await eval_mod.create_case(
        kb_id, payload.query, payload.expected_doc_ids,
        note=payload.note, created_by=_parse_user_id(x_user_id),
    )
    return {"id": str(case_id)}


@router.delete("/eval/cases/{case_id}")
async def delete_eval_case(case_id: int) -> dict[str, str]:
    if not await eval_mod.delete_case(case_id):
        raise HTTPException(status_code=404, detail="case not found")
    return {"status": "ok"}


@router.post("/{kb_id}/evaluate")
async def run_evaluation(
    kb_id: int, payload: EvalRunRequest | None = None,
) -> dict[str, Any]:
    top_k = (payload.top_k if payload else None) or 5
    try:
        return await eval_mod.evaluate(kb_id, top_k=top_k)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ----------- Serialisers (asyncpg Records → JSON-friendly dicts) -----------

def _serialise_kb(row: dict[str, Any]) -> dict[str, Any]:
    last_eval = row.get("last_eval_result")
    if isinstance(last_eval, str):
        import json as _json
        try:
            last_eval = _json.loads(last_eval)
        except Exception:
            last_eval = None
    return {
        "id": _to_str(row.get("id")),
        "name": row.get("name"),
        "description": row.get("description"),
        "embedding_model": row.get("embedding_model"),
        "embedding_dim": row.get("embedding_dim"),
        "rerank_model": row.get("rerank_model"),
        "chunk_size": row.get("chunk_size"),
        "chunk_overlap": row.get("chunk_overlap"),
        "retrieval_mode": row.get("retrieval_mode"),
        "top_k": row.get("top_k"),
        "score_threshold": row.get("score_threshold"),
        "doc_count": int(row.get("doc_count", 0) or 0),
        "chunk_count": int(row.get("chunk_count", 0) or 0),
        "last_eval_at": _iso(row.get("last_eval_at")),
        "last_eval_result": last_eval,
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _serialise_case(row: dict[str, Any]) -> dict[str, Any]:
    expected = row.get("expected_doc_ids")
    if isinstance(expected, str):
        import json as _json
        try:
            expected = _json.loads(expected)
        except Exception:
            expected = []
    return {
        "id": _to_str(row.get("id")),
        "kb_id": _to_str(row.get("kb_id")),
        "query": row.get("query"),
        "expected_doc_ids": [str(x) for x in (expected or [])],
        "note": row.get("note"),
        "created_at": _iso(row.get("created_at")),
    }


def _serialise_doc(row: dict[str, Any]) -> dict[str, Any]:
    source_meta = row.get("source_meta")
    if isinstance(source_meta, str):
        import json as _json
        try:
            source_meta = _json.loads(source_meta)
        except Exception:
            source_meta = None
    return {
        "id": _to_str(row.get("id")),
        "kb_id": _to_str(row.get("kb_id")),
        "name": row.get("name"),
        "source_type": row.get("source_type"),
        "source_meta": source_meta,
        "file_size_bytes": row.get("file_size_bytes"),
        "char_count": row.get("char_count"),
        "chunk_count": row.get("chunk_count"),
        "enabled": row.get("enabled", True),
        "indexing_status": row.get("indexing_status"),
        "indexing_error": row.get("indexing_error"),
        "indexed_at": _iso(row.get("indexed_at")),
        "created_at": _iso(row.get("created_at")),
    }


def _serialise_chunk(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        import json as _json
        try:
            metadata = _json.loads(metadata)
        except Exception:
            metadata = None
    return {
        "id": _to_str(row.get("id")),
        "document_id": _to_str(row.get("document_id")),
        "kb_id": _to_str(row.get("kb_id")),
        "chunk_index": row.get("chunk_index"),
        "content": row.get("content"),
        "metadata": metadata,
        "char_count": row.get("char_count"),
        "enabled": row.get("enabled", True),
    }


def _to_str(v: Any) -> str | None:
    return None if v is None else str(v)


def _iso(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()
    return str(v)


def _parse_user_id(header: str) -> int | None:
    if not header:
        return None
    try:
        return int(header)
    except ValueError:
        return None


def _pick(d: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    return {k: d.get(k) for k in keys}
