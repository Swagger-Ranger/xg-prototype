"""Tools infrastructure (MCP client + registry) — *skeleton only*.

与已有的 `app/tool/`（单数）共存，分工:
- `app/tool/`   = 具体业务 Tool 实现（query_tools / leave_config_tools / workstudy_prompts / base 等）
- `app/tools/`  = Tool 基础设施（MCP Client、按角色筛选、统一注册）

M3 末评估是否合并；当前两者通过 `tool_registry.discover()` 协作。

STATUS: skeleton-only, target: M3.1
"""
