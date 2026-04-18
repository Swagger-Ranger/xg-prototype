"""Local sentence-transformers embedder.

bge-small-zh-v1.5: 512-dim Chinese-optimized encoder, ~95MB download.
Lazy-loaded singleton so sidecar import stays fast; the model only
materializes on first retrieval (or via `warmup()` from a health check).
"""
from __future__ import annotations

import threading
from typing import Sequence

import numpy as np

from app.config import settings

# bge recommends prepending this to *queries only* (not passages).
_QUERY_INSTRUCTION = "为这个句子生成表示以用于检索相关文章："

_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(settings.embedding_model)
    return _model


def warmup() -> None:
    _get_model()


def embed_passages(texts: Sequence[str]) -> np.ndarray:
    model = _get_model()
    vecs = model.encode(
        list(texts),
        batch_size=16,
        convert_to_numpy=True,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    return vecs.astype(np.float32)


def embed_query(text: str) -> np.ndarray:
    model = _get_model()
    vec = model.encode(
        [_QUERY_INSTRUCTION + text],
        convert_to_numpy=True,
        show_progress_bar=False,
        normalize_embeddings=True,
    )[0]
    return vec.astype(np.float32)
