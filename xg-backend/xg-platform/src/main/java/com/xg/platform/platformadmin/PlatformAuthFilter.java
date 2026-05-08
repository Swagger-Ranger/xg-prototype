package com.xg.platform.platformadmin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.base.R;
import com.xg.platform.platformadmin.mapper.PlatformAdminMapper;
import com.xg.platform.platformadmin.model.PlatformAdmin;
import com.xg.platform.platformadmin.service.PlatformAdminErrorCode;
import com.xg.platform.platformadmin.service.PlatformAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Guards {@code /api/v1/platform/**} (except the login/logout entry-points).
 * Resolves the bearer token via {@link PlatformAuthService}, loads the admin
 * row to verify it's still active, and seeds {@link PlatformAdminContext} so
 * downstream services can identify the caller without re-querying.
 *
 * Runs before {@link com.xg.common.tenant.TenantFilter} so the platform
 * thread-local is available even if a request also carries an X-Tenant-Id.
 */
@Component
@RequiredArgsConstructor
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class PlatformAuthFilter extends OncePerRequestFilter {

    private static final String PATH_PREFIX = "/api/v1/platform/";
    private static final Set<String> WHITELIST = Set.of(
            "/api/v1/platform/auth/login"
    );

    private final PlatformAuthService authService;
    private final PlatformAdminMapper adminMapper;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (WHITELIST.contains(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = extractToken(request);
        Long adminId = authService.resolveAdminId(token);
        if (adminId == null) {
            writeError(response, 401, PlatformAdminErrorCode.INVALID_CREDENTIALS);
            return;
        }
        PlatformAdmin admin = adminMapper.selectById(adminId);
        if (admin == null || !"active".equals(admin.getStatus())) {
            writeError(response, 401, PlatformAdminErrorCode.ADMIN_DISABLED);
            return;
        }
        try {
            PlatformAdminContext.set(admin.getId(), admin.getUsername());
            filterChain.doFilter(request, response);
        } finally {
            PlatformAdminContext.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null) return null;
        if (header.startsWith("Bearer ")) return header.substring(7).trim();
        return header.trim();
    }

    private void writeError(HttpServletResponse response, int status,
                            PlatformAdminErrorCode code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(R.fail(code)));
    }
}
