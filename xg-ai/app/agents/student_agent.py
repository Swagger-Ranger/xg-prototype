"""Student-facing conversation agent — *skeleton only*.

预期职责（M3.3）:
- 学生身份的对话入口；工具集 = 查待办 / 查请假进度 / 查通知 / 查勤工申请 / 起草请假 / 起草理由 ...
- 默认不暴露任何写敏感数据的工具；写动作走"草稿 + 用户确认"两步。
- 知识库问答（学籍规定 / 请假管理办法 ...）通过 RAG Tool 暴露。

STATUS: skeleton-only, target: M3.3
"""
from __future__ import annotations

from typing import Any


def build_student_agent(*args: Any, **kwargs: Any) -> Any:
    raise NotImplementedError("build_student_agent will be implemented in M3.3")
