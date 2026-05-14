"""LangGraph checkpoint integration (business-facing entry) — *skeleton only*.

预期（M3.1）:
- `get_checkpointer()` → 单例 PostgresSaver；与 `app.graph.checkpointer` 二选一（M3.1 决定职责归属）。
- 业务侧通过 `config={"configurable": {"thread_id": ...}}` 串多轮对话。
- 支持 `clear_thread(thread_id)`：用户主动清空记忆。

依赖（pyproject.toml M3.1 时新增）:
- langgraph-checkpoint-postgres

STATUS: skeleton-only, target: M3.1
"""
