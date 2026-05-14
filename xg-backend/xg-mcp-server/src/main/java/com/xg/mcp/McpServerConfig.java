package com.xg.mcp;

/**
 * Spring AI MCP Server configuration — <strong>skeleton only (target: M3.1)</strong>.
 *
 * <p>预期（M3.1）:</p>
 * <ul>
 *   <li>注册 MCP Server bean，transport 选 HTTP + SSE Streamable（MCP 2026 推荐生产标准）。</li>
 *   <li>认证：从 Authorization header 的 JWT 反解 user / tenant，与 Web 请求走同一套 Sa-Token 上下文。</li>
 *   <li>暴露 {@code /mcp/**} 路径；Nginx 配置 {@code proxy_buffering off} + {@code proxy_read_timeout 3600s}。</li>
 * </ul>
 *
 * <p>当前文件不被任何 Spring 上下文加载（模块不参与构建）。</p>
 */
public class McpServerConfig {
    // STATUS: skeleton-only, target: M3.1
    private McpServerConfig() {}
}
