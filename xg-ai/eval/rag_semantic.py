"""Semantic retriever for eval comparison.

Loads bge-small-zh-v1.5 via sentence-transformers, embeds every article
in `ALL_ARTICLES` once at import, and serves top-K cosine-similarity
retrieval matching the signature of `app.rag.knowledge.retrieve`.

This is *eval-only* — no pgvector, no persistence. Vectors live in RAM.
If the keyword/semantic comparison justifies it, the next step is to
move this exact embed step into an `app/rag/store.py` pgvector backend.

Run:  /tmp/xg_rag_eval_venv/bin/python -m eval.rag_semantic
"""
from __future__ import annotations

import os
from typing import Sequence

import numpy as np

from app.rag.knowledge import ALL_ARTICLES, Article

# bge-small-zh-v1.5: 512-dim, ~95MB, Chinese-optimized.
_MODEL_NAME = os.environ.get("XG_EMBED_MODEL", "BAAI/bge-small-zh-v1.5")

# bge recommends prepending this to queries (but NOT to passages).
_QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章："


def _l2_normalize(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms


_model = None
_passage_vecs: np.ndarray | None = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def _get_passage_vecs() -> np.ndarray:
    global _passage_vecs
    if _passage_vecs is None:
        model = _get_model()
        # Passage side: feed the full article body (heading already prefixed).
        passages = [a.body for a in ALL_ARTICLES]
        vecs = model.encode(
            passages,
            batch_size=16,
            convert_to_numpy=True,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        _passage_vecs = vecs.astype(np.float32)
    return _passage_vecs


def retrieve(query: str, k: int = 5) -> Sequence[Article]:
    model = _get_model()
    passage_vecs = _get_passage_vecs()

    q_vec = model.encode(
        [_QUERY_INSTRUCTION + query],
        convert_to_numpy=True,
        show_progress_bar=False,
        normalize_embeddings=True,
    ).astype(np.float32)

    # Cosine == dot product since both sides are L2-normalized.
    sims = passage_vecs @ q_vec[0]
    top_idx = np.argsort(-sims)[:k]
    return [ALL_ARTICLES[i] for i in top_idx]


if __name__ == "__main__":
    # Tiny sanity run.
    for q in ("二等奖学金一年多少钱", "本科最多读几年", "晚上几点以后不让访客进"):
        hits = retrieve(q, 3)
        print(f"\nQ: {q}")
        for a in hits:
            print(f"  {a.article_id}  {a.heading[:40]}")
