"""Query → answer Redis cache (with query normalization) — *skeleton only*.

预期（M3.2）:
- `get_cached(query: str, kb_id: int, user_ctx: dict) -> Optional[CachedAnswer]`
- normalization：去停用词 / 全半角 / 同义词，命中率不至于太低也避免乱命中。
- TTL：默认 24h，敏感问答不缓存（按 KB metadata 控制）。

STATUS: skeleton-only, target: M3.2
"""
