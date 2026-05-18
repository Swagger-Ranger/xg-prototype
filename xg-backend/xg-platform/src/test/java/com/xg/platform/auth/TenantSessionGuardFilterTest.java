package com.xg.platform.auth;

import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * 只验证守卫的三条安全分支,不起 Spring / Redis:
 * header 与 session 不一致 → 403;一致或缺失 → session 权威覆盖;未登录 → 清空。
 * 直接调 doFilterInternal,绕开 OncePerRequestFilter 的路径跳过逻辑(单独平凡)。
 */
class TenantSessionGuardFilterTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private TenantSessionGuardFilter newFilter() throws Exception {
        TenantSessionGuardFilter f = new TenantSessionGuardFilter(mapper);
        Field enabled = TenantSessionGuardFilter.class.getDeclaredField("enabled");
        enabled.setAccessible(true);
        enabled.setBoolean(f, true);
        return f;
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private HttpServletRequest reqWithToken() {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn("Bearer tok");
        return req;
    }

    @Test
    void header_mismatch_session_returns_403_and_blocks_chain() throws Exception {
        HttpServletRequest req = reqWithToken();
        HttpServletResponse resp = mock(HttpServletResponse.class);
        StringWriter body = new StringWriter();
        when(resp.getWriter()).thenReturn(new PrintWriter(body));
        FilterChain chain = mock(FilterChain.class);

        TenantContext.setTenantId("attacker"); // TenantFilter 按 header 设的

        try (MockedStatic<StpUtil> st = mockStatic(StpUtil.class)) {
            st.when(() -> StpUtil.getLoginIdByToken("tok")).thenReturn(7L);
            SaSession sess = mock(SaSession.class);
            when(sess.get("tenantId")).thenReturn("victim");
            st.when(() -> StpUtil.getSessionByLoginId(7L, false)).thenReturn(sess);

            newFilter().doFilterInternal(req, resp, chain);
        }

        verify(resp).setStatus(403);
        assertThat(body.toString()).contains("TENANT_SESSION_MISMATCH");
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    void session_overrides_when_header_absent() throws Exception {
        HttpServletRequest req = reqWithToken();
        HttpServletResponse resp = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);
        // header 缺失 → TenantFilter 没设 TenantContext
        try (MockedStatic<StpUtil> st = mockStatic(StpUtil.class)) {
            st.when(() -> StpUtil.getLoginIdByToken("tok")).thenReturn(7L);
            SaSession sess = mock(SaSession.class);
            when(sess.get("tenantId")).thenReturn("alpha");
            st.when(() -> StpUtil.getSessionByLoginId(7L, false)).thenReturn(sess);

            newFilter().doFilterInternal(req, resp, chain);
        }

        assertThat(TenantContext.getSchemaName()).isEqualTo("tenant_alpha");
        verify(chain).doFilter(req, resp);
        verify(resp, never()).setStatus(anyInt());
    }

    @Test
    void unauthenticated_clears_tenant_and_continues() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getHeader("Authorization")).thenReturn(null);
        HttpServletResponse resp = mock(HttpServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        TenantContext.setTenantId("sneaky"); // 未登录却带了 X-Tenant-Id

        newFilter().doFilterInternal(req, resp, chain);

        assertThat(TenantContext.getTenantId()).isNull();
        verify(chain).doFilter(req, resp);
    }

    /** HIGH-1 回归:/internal/** 只带 X-Tenant-Id 无 Bearer,必须被 guard 跳过,
     *  否则会清掉 TenantFilter 设的合法租户。platform / login 同样跳过;普通 API 不跳过。 */
    @Test
    void shouldNotFilter_excludesInternalPlatformLogin_butNotNormalApi() throws Exception {
        TenantSessionGuardFilter f = newFilter();
        assertThat(skip(f, "/internal/v1/notifications/send")).isTrue();
        assertThat(skip(f, "/api/v1/platform/admins")).isTrue();
        assertThat(skip(f, "/api/v1/auth/login")).isTrue();
        assertThat(skip(f, "/api/v1/work-study/applications")).isFalse();
    }

    private boolean skip(TenantSessionGuardFilter f, String uri) {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getRequestURI()).thenReturn(uri);
        return f.shouldNotFilter(req);
    }
}
