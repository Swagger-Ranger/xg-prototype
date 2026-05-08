from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RetrievalMode = Literal["vector", "keyword", "hybrid"]
SourceType = Literal["file", "url", "manual"]
IndexingStatus = Literal["pending", "processing", "done", "error"]


class KnowledgeBase(BaseModel):
    id: int
    name: str
    description: str | None = None
    embedding_model: str
    embedding_dim: int = 1024
    rerank_model: str | None = None
    chunk_size: int = 500
    chunk_overlap: int = 50
    retrieval_mode: RetrievalMode = "hybrid"
    top_k: int = 5
    score_threshold: float | None = None
    created_at: datetime
    updated_at: datetime


class KbCreateRequest(BaseModel):
    name: str
    description: str | None = None
    embedding_model: str = "qwen-text-embedding-v3"
    embedding_dim: int = 1024
    rerank_model: str | None = None
    chunk_size: int = Field(500, ge=100, le=4000)
    chunk_overlap: int = Field(50, ge=0, le=500)
    retrieval_mode: RetrievalMode = "hybrid"
    top_k: int = Field(5, ge=1, le=50)
    score_threshold: float | None = None


class KbUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    embedding_model: str | None = None
    rerank_model: str | None = None
    chunk_size: int | None = Field(None, ge=100, le=4000)
    chunk_overlap: int | None = Field(None, ge=0, le=500)
    retrieval_mode: RetrievalMode | None = None
    top_k: int | None = Field(None, ge=1, le=50)
    score_threshold: float | None = None


class Document(BaseModel):
    id: int
    kb_id: int
    name: str
    source_type: SourceType
    source_meta: dict[str, Any] | None = None
    file_size_bytes: int | None = None
    char_count: int | None = None
    chunk_count: int | None = None
    enabled: bool = True
    indexing_status: IndexingStatus
    indexing_error: str | None = None
    indexed_at: datetime | None = None
    created_at: datetime


class Chunk(BaseModel):
    id: int
    document_id: int
    kb_id: int
    chunk_index: int
    content: str
    metadata: dict[str, Any] | None = None
    char_count: int | None = None
    enabled: bool = True


class HitTestResult(BaseModel):
    chunk_id: int
    document_id: int
    document_name: str | None = None
    chunk_index: int
    content: str
    score: float
    source: Literal["vector", "keyword", "hybrid", "rerank"]


class HitTestRequest(BaseModel):
    query: str
    top_k: int | None = None
    mode: RetrievalMode | None = None  # override KB default


class EvalCaseCreateRequest(BaseModel):
    query: str
    expected_doc_ids: list[int]
    note: str | None = None


class EvalRunRequest(BaseModel):
    top_k: int | None = Field(None, ge=1, le=50)
