"""Shared LangGraph State schema — *skeleton only*.

预期（M3.1）:
- 以 `TypedDict` / Pydantic 定义跨节点共享的 State，至少包含:
  messages / user_ctx（user_id, role, tenant_id）/ tool_call_history / trace_id。

STATUS: skeleton-only, target: M3.1
"""
