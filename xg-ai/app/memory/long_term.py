"""Long-term per-user memory (preferences / facts) — *skeleton only*.

预期（M3.1+ 或 P1）:
- 跨 session 的用户偏好 / 历史摘要（"该用户偏好简短回复"、"该用户常请病假"）。
- 实现可选 `langgraph-memory` 或自建 PG 表 `ai_user_memory`。

STATUS: skeleton-only, target: M3.1
"""
