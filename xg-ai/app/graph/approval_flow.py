"""HITL approval flow (high-risk tool gating) — *skeleton only*.

预期（M3.3）:
- StateGraph: agent → conditional(has_high_risk_call) → interrupt → human_approve → tools → agent
- 待审批的 tool_calls 写入 `ai_approval_queue`；审批人通过 `/api/v1/agent/approve` 回写决定，
  graph 用 `agent.update_state` 注入决定再 resume。
- 完整流程需配 `app.memory.checkpoint`（thread_id）+ `app.observability.audit`。

STATUS: skeleton-only, target: M3.3
"""
