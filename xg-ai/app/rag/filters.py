"""Metadata filter builders (权限 / 部门 / 时间 / 标签) — *skeleton only*.

预期（M3.2）:
- 构造 PGVector `jsonb` 过滤表达式。
- 与 `tenant_id` / `user_role` / `department` 自动绑定，避免越权检索。
- 现有 `app/rag/kb/dao.py` 增加 `metadata_filter` 参数（默认 None 保持向后兼容）。

STATUS: skeleton-only, target: M3.2
"""
