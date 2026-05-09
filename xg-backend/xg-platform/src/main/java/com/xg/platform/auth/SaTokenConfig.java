package com.xg.platform.auth;

import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.stp.StpUtil;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Sa-Token 全局登录拦截器。
 *
 * <p>未通过 {@link cn.dev33.satoken.stp.StpUtil#checkLogin()} 的请求一律抛
 * {@code NotLoginException}，由 {@link SaTokenExceptionHandler} 转成 HTTP 401。
 *
 * <h3>白名单（不需要登录）</h3>
 * <ul>
 *   <li>{@code /api/v1/auth/login} —— 登录入口</li>
 *   <li>{@code /actuator/**} —— 健康检查 / 监控（生产由网关层再约束）</li>
 *   <li>{@code /internal/**} —— 内网调用（如 sidecar → notification:send），假定走网络隔离</li>
 *   <li>{@code /error} —— Spring 默认错误页</li>
 * </ul>
 *
 * <p>不在白名单的所有 endpoint 即使没标 {@link cn.dev33.satoken.annotation.SaCheckPermission}
 * 也至少要求登录态——避免 read-only / summary 类接口因为漏标 perm 注解就裸奔。
 * 细粒度的权限校验仍由 {@code @SaCheckPermission} 完成（403）。
 */
@Configuration
public class SaTokenConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new SaInterceptor(handler -> StpUtil.checkLogin()))
                .addPathPatterns("/**")
                .excludePathPatterns(
                        "/api/v1/auth/login",
                        "/actuator/**",
                        "/internal/**",
                        "/error",
                        "/favicon.ico"
                );
    }
}
