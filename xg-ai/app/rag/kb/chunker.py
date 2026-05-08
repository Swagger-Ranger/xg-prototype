"""Text chunker — wraps LangChain's RecursiveCharacterTextSplitter so we
can swap implementations later (token-based, semantic) without changing
the ingest flow."""
from __future__ import annotations

from typing import Any


def split_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    separators: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Returns [{chunk_index, content, char_count}, ...].

    LangChain's RecursiveCharacterTextSplitter falls back through the
    separators list, preferring boundary-respecting splits (paragraph →
    sentence → space → char). For Chinese leave-policy text the default
    list ['\\n\\n', '\\n', ' ', ''] does fine; we add Chinese punctuation
    so chunks don't split mid-sentence."""
    if not text or not text.strip():
        return []
    try:
        # langchain 0.2+ split splitters into the dedicated package; fall
        # back to the legacy import path if only the umbrella `langchain`
        # is installed.
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
        except ImportError:
            from langchain.text_splitter import RecursiveCharacterTextSplitter  # noqa: WPS433
    except ImportError as e:
        raise RuntimeError(
            "切分需要 langchain-text-splitters：pip install langchain-text-splitters"
        ) from e

    seps = separators or [
        "\n\n", "\n",
        "。", "！", "？", "；",
        ",", "，", " ", "",
    ]
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=seps,
        keep_separator=True,
        length_function=len,
    )
    pieces = splitter.split_text(text)
    return [
        {"chunk_index": i, "content": piece, "char_count": len(piece)}
        for i, piece in enumerate(pieces)
    ]
