package com.xg.platform.auth;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.exception.NotRoleException;
import com.xg.common.base.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Sa-Token 异常 → 友好 HTTP 状态映射。
 *
 * <p>放在 xg-platform 是因为 xg-common 不依赖 Sa-Token；这里独立出 advice 类，
 * {@code @Order} 比兜底的 {@link com.xg.common.exception.GlobalExceptionHandler}
 * 高，所以会优先匹配 Sa-Token 抛出的 NotLoginException / NotPermissionException 等，
 * 不会被泛 {@code Exception.class} 处理器吞成 500。
 */
@Slf4j
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SaTokenExceptionHandler {

    /**
     * 未登录 / token 失效 / token 不存在 → 401。前端 client.ts 的拦截器看到 401
     * 会自动跳登录页，所以这里要返回 401（HttpStatus.UNAUTHORIZED）。
     */
    @ExceptionHandler(NotLoginException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public R<Void> handleNotLogin(NotLoginException e) {
        log.warn("NotLogin [{}]: {}", e.getType(), e.getMessage());
        return R.fail("UNAUTHORIZED", "未登录或登录已过期");
    }

    /** @SaCheckPermission 失败 → 403。 */
    @ExceptionHandler(NotPermissionException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public R<Void> handleNotPermission(NotPermissionException e) {
        log.warn("NotPermission: required={}", e.getPermission());
        return R.fail("FORBIDDEN", "无权限：" + e.getPermission());
    }

    /** @SaCheckRole 失败 → 403。 */
    @ExceptionHandler(NotRoleException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public R<Void> handleNotRole(NotRoleException e) {
        log.warn("NotRole: required={}", e.getRole());
        return R.fail("FORBIDDEN", "角色不足：需要 " + e.getRole());
    }
}
