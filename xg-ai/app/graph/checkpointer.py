"""LangGraph PostgresSaver wrapper — *skeleton only*.

预期（M3.1）:
- 单例 `get_checkpointer()`，懒初始化 `PostgresSaver.from_conn_string(...)`。
- 使用独立 schema `langgraph`，由 `checkpointer.setup()` 自建。
- FastAPI lifespan 启动时 `await saver.setup()`。

注意：本文件**不替代** `app/memory/checkpoint.py`；两者关系为：
- `app/memory/checkpoint.py` — 业务侧入口（被 agent 引用）
- `app/graph/checkpointer.py` — 底层 saver 实例化与 schema 管理

M3.1 实现时需明确两者职责或合二为一。

STATUS: skeleton-only, target: M3.1
"""
