"""Reranker abstraction — pluggable cross-encoder reranking.

Pipeline contract:
1. Retriever produces a *wide* candidate pool (e.g. 4× final_k) with
   first-stage scores (cosine / ts_rank / RRF).
2. Reranker re-scores each (query, candidate.content) pair and returns
   the top_k by new score, sorted descending.
3. Each returned row keeps its original keys; reranker overwrites
   `score` with the rerank score and adds `rerank_score` for clarity.

Current state: only `NoOpReranker` is functional. `BgeReranker` is a
stub kept here so the wiring point and dependency surface are obvious
when BAAI/bge-reranker-v2-m3 (or v2-base) is wired in.

Implementation notes for the BGE plug-in (deferred):
- Add `FlagEmbedding` to pyproject (or use sentence-transformers
  CrossEncoder). FlagEmbedding ships `FlagReranker` directly.
- v2-m3 ≈ 568 MB; v2-base ≈ 280 MB. CPU inference is fine for
  sub-100 candidates; consider torch.no_grad + batch_size=8.
- Load lazily on first call (mirror app.rag.embedder pattern).
- Wrap the sync model call in `asyncio.to_thread` so we don't
  block the FastAPI loop.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class Reranker(Protocol):
    async def rerank(
        self, query: str, candidates: list[dict[str, Any]], top_k: int,
    ) -> list[dict[str, Any]]: ...


class NoOpReranker:
    """Identity reranker — preserves first-stage order, just truncates.

    Used when no rerank_model is configured *and* as the safe fallback
    when a configured model isn't wired yet (so `kb.rerank_model` set
    in DB doesn't crash the chat path)."""

    async def rerank(
        self, query: str, candidates: list[dict[str, Any]], top_k: int,
    ) -> list[dict[str, Any]]:
        return candidates[:top_k]


class BgeReranker:
    """Stub for BAAI/bge-reranker-v2-m3 (or v2-base).

    Not yet implemented — see module docstring for the steps. Until
    then the factory routes BGE requests to NoOpReranker so the
    pipeline doesn't break if a KB row has `rerank_model='bge-...'`.
    """

    def __init__(self, model_name: str):
        self.model_name = model_name

    async def rerank(
        self, query: str, candidates: list[dict[str, Any]], top_k: int,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError(
            f"BgeReranker({self.model_name!r}) not wired yet — "
            "see app/rag/kb/reranker.py docstring"
        )


def get_reranker(model_name: str | None) -> Reranker:
    """Factory: pick a reranker by KB.rerank_model.

    Empty / 'none' / unknown → NoOp. BGE family currently routes to NoOp
    too (with a warning) until BgeReranker is implemented; flipping the
    switch is a one-line change here once it's wired."""
    if not model_name or model_name.lower() in ("none", "no", "off"):
        return NoOpReranker()
    if model_name.lower().startswith("bge"):
        # TODO(rerank): swap to `return BgeReranker(model_name)` once
        # the BGE stub is implemented.
        logger.info(
            "rerank_model=%s configured but BgeReranker not wired; "
            "using NoOpReranker. Implement BgeReranker.rerank to enable.",
            model_name,
        )
        return NoOpReranker()
    logger.warning("unknown rerank_model=%s; using NoOpReranker", model_name)
    return NoOpReranker()
