# xg-mcp-server

**STATUS: skeleton-only, target: M3.1**

把 `xg-business` / `xg-platform` 已有的业务能力包装成 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) Server，
供 Python AI Sidecar、Cursor、学校自有 AI 平台等任意 MCP 客户端调用。

## 当前状态（M1）

- **未加入 `settings.gradle`**：`./gradlew :xg-app:build` 完全不感知本模块。
- 仅有 4 个空骨架类（`McpServerConfig` / `ToolRegistry` / `ToolContext` / `transport/`），全部 `// STATUS: skeleton-only`。
- 不要在主程序中 import 本模块的任何符号。

## 启用方式（M3.1 之后）

1. 在 `xg-backend/settings.gradle` 加 `include 'xg-mcp-server'`
2. 在 `xg-backend/xg-app/build.gradle` 加 `implementation project(':xg-mcp-server')`
3. 完整化 `McpServerConfig`：注册 Spring AI MCP Server bean，配置 transport（推荐 HTTP + SSE Streamable）。
4. 完整化 `ToolRegistry`：扫描 `@McpTool` 注解。建议每个业务包（`leave / collection / ...`）下增加 `tool/` 子包，
   保持"业务自治"，由 `ToolRegistry` 自动聚合，避免 MCP 模块直接依赖业务 service。
5. 完整化 `ToolContext`：从 MCP 请求 header 的 JWT 反解出 user / tenant，注入与 Web 请求同一套 ThreadLocal。

## 与现有 `AiSidecarClient` 的关系

- **`AiSidecarClient`（Java→Python REST）保留**，处理 Java 主动调 Python 的场景（如 `InsightService` 定期扫描）。
- **`xg-mcp-server`（Python→Java MCP）补充**，处理 Python Agent 主动调 Java 业务能力的场景。
- 二者**互不替代，长期双轨**。
