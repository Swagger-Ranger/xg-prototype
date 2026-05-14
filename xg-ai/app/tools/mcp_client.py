"""MCP Client singleton — *skeleton only*.

预期（M3.1）:
- 使用 `langchain_mcp_adapters.MultiServerMCPClient`，连接 Java `xg-mcp-server`。
- 生命周期由 FastAPI lifespan 管理（M3.1 起在 `main.py` 注册）。
- `get_mcp_tools(user_role) -> list[Tool]`：按角色返回工具子集，对 `app.agents.*` 透明。

依赖（pyproject.toml M3.1 时新增）:
- langchain-mcp-adapters
- mcp >= 1.27.0

STATUS: skeleton-only, target: M3.1
"""
