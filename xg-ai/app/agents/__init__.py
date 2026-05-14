"""Conversation Agents (role-based) — *skeleton only*.

`agents/` 与已有的 `agent/` 不冲突，两者用途正交：

- `app/agent/` 已存在：DSL **author agent**（`workflow_author` / `alert_rule_author`），
  把自然语言转成 JSON DSL，单次调用 + JSON Schema 校验 + 有限重试。
- `app/agents/` 本目录：**conversation / scene agent**（学生事务 / 教师事务 / 管理员），
  长对话、调 MCP Tool、可恢复（PostgresSaver checkpoint）、可 HITL（interrupt）。

实现里程碑：M3.3。M1/M2 阶段保持空壳，不被任何业务路径 import。
"""
# STATUS: skeleton-only, target: M3.3
