package com.xg.platform.auth;

import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.base.R;
import com.xg.common.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 把租户上下文绑定到登录 session，堵住 "token 一条线、X-Tenant-Id 另一条线" 的跨租户口子。
 *
 * <p>跑在 {@link com.xg.common.tenant.TenantFilter}（+10）之后：TenantFilter 已按 header
 * 设好（或没设）TenantContext，这里用登录 session 里的 tenantId 做权威覆盖。
 *
 * <p>session 走 token 直接解析（{@code getLoginIdByToken} → Redis dao），不依赖
 * RequestContextHolder，因此在 SaInterceptor 之前的 servlet filter 阶段也能安全读取。
 *
 * <p>{@code xg.rbac.tenant-session-guard.enabled=false} 时整个过滤器旁路，退回旧行为。
 */
@Component
@RequiredArgsConstructor
@Order(Ordered.HIGHEST_PRECEDENCE + 11)
public class TenantSessionGuardFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;

    @Value("${xg.rbac.tenant-session-guard.enabled:true}")
    private boolean enabled;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        // 与 SaTokenConfig 白名单一致:平台后台由 PlatformAuthFilter 管;登录接口此时还没有
        // session,放行走 body tenant;/internal/** 是服务端内调,只带 X-Tenant-Id 无 Bearer
        // token —— 必须放行,否则 sessionTenant==null 分支会清掉 TenantFilter 按 header 设的
        // 合法租户,破坏 "/internal/** + X-Tenant-Id" 契约(如 /internal/v1/notifications/send)。
        return uri.startsWith("/api/v1/platform/")
                || uri.startsWith("/internal/")
                || uri.equals("/api/v1/auth/login");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!enabled) {
            filterChain.doFilter(request, response);
            return;
        }

        String sessionTenant = resolveSessionTenant(request);

        if (sessionTenant == null) {
            // 未登录的非登录请求：不允许靠 header 切 schema，清掉 TenantFilter 按 header 设的值。
            // 后续 SaInterceptor 会 401，这里只是确保它不会带着别人租户的 schema 进业务查询。
            TenantContext.clear();
            filterChain.doFilter(request, response);
            return;
        }

        String headerTenant = TenantContext.getTenantId(); // TenantFilter 已按 header 校验并设入
        if (headerTenant != null && !headerTenant.equals(sessionTenant)) {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(
                    R.fail("TENANT_SESSION_MISMATCH", "租户与登录会话不一致")));
            return;
        }

        // session 权威：覆盖（含 header 缺失时补全），保证业务查询落在登录租户 schema。
        TenantContext.setTenantId(sessionTenant);
        TenantContext.setSchemaName("tenant_" + sessionTenant);
        filterChain.doFilter(request, response);
    }

    /** 用 bearer token 直接解析登录 session 里的 tenantId；解析不到（未登录/失效）返回 null。 */
    private String resolveSessionTenant(HttpServletRequest request) {
        try {
            String token = extractToken(request);
            if (token == null) return null;
            Object loginId = StpUtil.getLoginIdByToken(token);
            if (loginId == null) return null;
            SaSession session = StpUtil.getSessionByLoginId(loginId, false);
            if (session == null) return null;
            Object t = session.get("tenantId");
            return t == null ? null : t.toString();
        } catch (Exception e) {
            // sa-token 异常一律按"未登录"处理，绝不放行到别的租户 schema。
            return null;
        }
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || header.isBlank()) return null;
        return header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
    }
}
