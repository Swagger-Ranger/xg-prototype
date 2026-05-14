"""AI audit log writer — *skeleton only* (M3.1).

预期:
- `write_audit(trace_id, user_id, role, tool_name, args, result, is_high_risk, approved_by=None)`
- 落 PG 表 `ai_audit_log`（M3.1 DB 迁移），同时把要点作为 metadata 写入 Langfuse trace。

STATUS: skeleton-only, target: M3.1
"""
