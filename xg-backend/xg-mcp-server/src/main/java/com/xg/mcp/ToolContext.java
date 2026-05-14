package com.xg.mcp;

/**
 * MCP request → user / tenant context bridge — <strong>skeleton only (target: M3.1)</strong>.
 *
 * <p>预期（M3.1）:</p>
 * <ul>
 *   <li>从 MCP 请求 header 的 JWT 解出 user_id / tenant_id / role。</li>
 *   <li>调用 {@code com.xg.common.tenant.TenantContext.setTenantId(...)} 与 Sa-Token 的 StpUtil，
 *       让 MCP tool 调用与 Web Controller 走同一套上下文（多租户隔离、权限校验、审计日志）。</li>
 *   <li>请求结束时 {@code TenantContext.clear()}，防止 ThreadLocal 泄漏。</li>
 * </ul>
 */
public class ToolContext {
    // STATUS: skeleton-only, target: M3.1
    private ToolContext() {}
}
