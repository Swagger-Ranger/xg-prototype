package com.xg.mcp;

/**
 * MCP Tool registry — <strong>skeleton only (target: M3.1)</strong>.
 *
 * <p>预期（M3.1）:</p>
 * <ul>
 *   <li>扫描业务包内的 {@code @McpTool} 注解（约定每个业务包下增加 {@code tool/} 子包）。</li>
 *   <li>把扫描结果注册到 MCP Server 的 tool list，使其可通过 {@code tools/list} 协议接口被发现。</li>
 *   <li>启动时输出工具元数据 catalog（name / desc / required_role / risk_level）。</li>
 * </ul>
 *
 * <p>不直接 import 业务 service：业务包通过 {@code tool/} 子包"自行"声明工具，
 * MCP 模块只负责扫描注册，符合 v1 架构方案的"包边界 = 未来微服务边界"约束。</p>
 */
public class ToolRegistry {
    // STATUS: skeleton-only, target: M3.1
    private ToolRegistry() {}
}
