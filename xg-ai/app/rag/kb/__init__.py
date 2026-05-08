"""Multi-knowledge-base RAG management — Dify-style.

Layout:
- schemas.py — Pydantic types for API
- dao.py     — asyncpg CRUD against public.{knowledge_base, kb_document, kb_chunk}
- parsers.py — md/txt/pdf/docx → plain text
- chunker.py — LangChain RecursiveCharacterTextSplitter wrapper
- ingest.py  — file → parse → chunk → embed → upsert
- retriever.py — vector / keyword / hybrid + optional rerank
"""
