"""Unified Tool Registry — *skeleton only*.

预期（M3.1）:
- 把"业务工具（来自 `app.tool.*`）"+"MCP 工具（来自 `app.tools.mcp_client`）"+"RAG 工具"统一注册。
- 提供 `get_tools_for_role(role: str) -> list[Tool]`，按 role 过滤。
- 写一份"tool 元数据 catalog"（name / desc / risk_level / required_role / source），
  作为 Agent 启动时的工具白名单依据，也用于审计 / Langfuse metadata。

不破坏现有：`app.tool.*` 现有 import 路径不变，Registry 只做"聚合 + 角色过滤"。

STATUS: skeleton-only, target: M3.1
"""
