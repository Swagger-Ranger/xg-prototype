"""KB retriever — vector / keyword / hybrid (RRF) + optional rerank.

Reranker plugs in via `app.rag.kb.reranker`. When `kb.rerank_model` is
set, retrieval pulls a wider pool (RERANK_POOL_MULT × top_k) and the
reranker narrows it; when it's unset the original first-stage top_k
ranking is returned unchanged."""
from __future__ import annotations

import logging
from typing import Any

from app.rag.embedder import embed_query
from app.rag.kb import dao
from app.rag.kb.reranker import get_reranker

logger = logging.getLogger(__name__)


# Reciprocal Rank Fusion constant. 60 is the classic Cormack/Buettcher
# default — small enough that top hits dominate, large enough that
# fusion smooths over noisy individual rankings.
RRF_K = 60

# When a reranker is configured, retrieve this many times the final
# top_k as candidates so the cross-encoder has room to reorder. 4× is
# the common Dify / LlamaIndex default.
RERANK_POOL_MULT = 4


async def retrieve(
    kb: dict[str, Any], query: str, *,
    mode: str | None = None, top_k: int | None = None,
) -> list[dict[str, Any]]:
    """Returns the unified hit list per the KB's retrieval mode (or the
    overrides passed in). If `kb.rerank_model` is set, a wider candidate
    pool is fetched and passed through the reranker."""
    chosen_mode = (mode or kb.get("retrieval_mode") or "hybrid").lower()
    final_k = top_k or kb.get("top_k") or 5
    threshold = kb.get("score_threshold")
    kb_id = kb["id"]
    rerank_model = kb.get("rerank_model")

    pool_k = final_k * RERANK_POOL_MULT if rerank_model else final_k

    if chosen_mode == "vector":
        results = await _vector_only(kb_id, query, pool_k, threshold)
    elif chosen_mode == "keyword":
        results = await dao.keyword_search(kb_id, query, pool_k)
    else:
        # hybrid: pull more from each side than we'll return, then fuse.
        # Honour the KB's vector threshold so off-topic queries don't pad
        # RRF with weak vector hits when keyword side is empty.
        vec_pool, kw_pool = await _gather_pools(kb_id, query, pool_k * 2, threshold)
        results = _rrf_fuse(vec_pool, kw_pool, top_k=pool_k)

    if rerank_model:
        reranker = get_reranker(rerank_model)
        try:
            results = await reranker.rerank(query, results, final_k)
        except NotImplementedError:
            logger.warning(
                "rerank_model=%s not implemented; returning first-stage top_k",
                rerank_model,
            )
            results = results[:final_k]
    return results[:final_k]


async def _vector_only(
    kb_id: int, query: str, top_k: int, threshold: float | None,
) -> list[dict[str, Any]]:
    try:
        vec = embed_query(query)
    except Exception:
        logger.exception("embed_query failed; degrading to keyword-only")
        return await dao.keyword_search(kb_id, query, top_k)
    return await dao.vector_search(kb_id, vec, top_k, threshold)


async def _gather_pools(
    kb_id: int, query: str, pool_size: int,
    vec_threshold: float | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Pull both retrievers in parallel-ish (sequential await is cheap;
    asyncpg pool reuses connections) and return the two pre-fusion lists."""
    vec_results: list[dict[str, Any]] = []
    try:
        vec = embed_query(query)
        vec_results = await dao.vector_search(kb_id, vec, pool_size, vec_threshold)
    except Exception:
        logger.exception("vector retrieve failed in hybrid; using keyword only")
    try:
        kw_results = await dao.keyword_search(kb_id, query, pool_size)
    except Exception:
        logger.exception("keyword retrieve failed in hybrid; using vector only")
        kw_results = []
    return vec_results, kw_results


def _rrf_fuse(
    vec_results: list[dict[str, Any]],
    kw_results: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d)).

    Each list contributes a per-rank score; the final ranking by sum is
    robust to wildly different score scales between retrievers (vector
    cosine vs ts_rank). We tag the source for UI debugging."""
    aggregated: dict[int, dict[str, Any]] = {}

    def _accumulate(rows: list[dict[str, Any]], source_label: str) -> None:
        for rank, row in enumerate(rows, start=1):
            cid = int(row["chunk_id"])
            entry = aggregated.setdefault(cid, {**row, "score": 0.0, "sources": []})
            entry["score"] += 1.0 / (RRF_K + rank)
            entry["sources"].append(source_label)

    _accumulate(vec_results, "vector")
    _accumulate(kw_results, "keyword")

    out = sorted(aggregated.values(), key=lambda r: r["score"], reverse=True)
    out = out[:top_k]
    for r in out:
        r["source"] = "hybrid"
        r["sources"] = sorted(set(r.get("sources", [])))  # for the "命中来源" badge
    return out
