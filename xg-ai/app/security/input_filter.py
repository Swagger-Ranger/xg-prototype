"""Prompt injection & input sanitation — *skeleton only*.

预期（M3.1）:
- 规则 + 小模型检测：override system instruction / 越权指令 / 危险关键词。
- 默认软关（记 warn 不拦截），可通过 env `INPUT_FILTER_HARD=1` 切硬关。

STATUS: skeleton-only, target: M3.1
"""
