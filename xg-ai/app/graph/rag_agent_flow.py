"""RAG + Agent hybrid flow — *skeleton only*.

预期（M3.3）:
- 意图分类节点 → {纯闲聊 / RAG 问答 / 工具调用} 三路分流。
- RAG 路：query_transform → retrieve → rerank → generate（带引用）。
- 工具路：复用 `app.agents.*` 的 ReAct 循环。

STATUS: skeleton-only, target: M3.3
"""
