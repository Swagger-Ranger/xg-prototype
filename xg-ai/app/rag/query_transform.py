"""Query rewriting strategies (HyDE / Multi-Query / Step-Back) — *skeleton only*.

预期（M3.2）:
- `rewrite(query: str, strategy: Literal["hyde","multi_query","step_back","none"]) -> list[str]`
- 在 `app/rag/kb/retriever.py` 中通过 `query_transform_mode` 参数选用；默认 `none` 保持现有行为。
- HyDE：让 LLM 先写一段"理想答案"再 embed 检索；Multi-Query：扩展 N 个变体并 union。

STATUS: skeleton-only, target: M3.2
"""
