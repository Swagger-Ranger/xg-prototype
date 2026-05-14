"""Admin / 学工处 conversation agent — *skeleton only*.

预期职责（M3.3）:
- 包含高风险工具（批量改成绩、批量发通知、删档案）；所有高风险工具默认 `interrupt_before`。
- 工具调用前后写 `ai_audit_log`，并提供一键回滚入口。
- 全量行为接入 Langfuse trace，便于事后审计。

STATUS: skeleton-only, target: M3.3
"""
from __future__ import annotations

from typing import Any


def build_admin_agent(*args: Any, **kwargs: Any) -> Any:
    raise NotImplementedError("build_admin_agent will be implemented in M3.3")
