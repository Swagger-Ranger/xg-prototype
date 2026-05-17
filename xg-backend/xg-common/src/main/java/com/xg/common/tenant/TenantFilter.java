package com.xg.common.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

/**
 * 把 X-Tenant-Id 转成 TenantContext。只做与 sa-token 无关的两件事：
 * <ul>
 *   <li>平台后台路径不进租户 schema（由 PlatformAuthFilter 负责）。</li>
 *   <li>tenantId 必须先过格式校验再拼 schema，挡掉 {@code default;drop} 这类注入形状。</li>
 * </ul>
 * header 与登录 session 的一致性绑定不在这里做 —— xg-common 不依赖 sa-token，
 * 由 xg-platform 的 TenantSessionGuardFilter（@Order +11，本过滤器之后）负责。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantFilter extends OncePerRequestFilter {

    /** 租户标识合法字符集；不允许大写 / 短横线 / 点号（RBAC 落地方案 §4.2）。 */
    private static final Pattern VALID_TENANT = Pattern.compile("^[a-z0-9_]{1,32}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            // 平台后台不走租户 schema；带不带 X-Tenant-Id 都忽略。
            if (request.getRequestURI().startsWith("/api/v1/platform/")) {
                filterChain.doFilter(request, response);
                return;
            }

            String tenantId = request.getHeader("X-Tenant-Id");
            if (tenantId != null && !tenantId.isBlank()) {
                if (!VALID_TENANT.matcher(tenantId).matches()) {
                    response.setStatus(400);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write(
                            "{\"code\":\"INVALID_TENANT\",\"message\":\"非法租户标识\"}");
                    return;
                }
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName("tenant_" + tenantId);
            }
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
