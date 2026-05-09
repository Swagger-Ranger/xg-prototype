package com.xg.platform.auth;

import cn.dev33.satoken.stp.StpUtil;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import lombok.extern.slf4j.Slf4j;

/**
 * 当前登录用户的统一获取入口。
 *
 * <p>仅信任 Sa-Token session（{@code Authorization: Bearer xxx} 由 {@code AuthService.login()}
 * 颁发）。X-User-Id header 兜底已在 P2.3 移除——任何带 header 不带 token 的请求会 UNAUTHORIZED。
 *
 * <p>用法：业务 Controller / Service 写 {@code Long userId = CurrentUser.id()}。
 * 调度任务 / 异步消费者用 {@link #idOrNull()}（无 web 上下文时返回 null 不抛）。
 */
@Slf4j
public final class CurrentUser {

    private CurrentUser() {}

    /** 取当前用户 id。无 Sa-Token session 抛 UNAUTHORIZED（HTTP 401 等价）。 */
    public static Long id() {
        Long id = idOrNull();
        if (id == null) {
            throw new BizException(GlobalErrorCode.UNAUTHORIZED);
        }
        return id;
    }

    /** 解析不到返回 null（不抛异常）—— 给调度任务 / 异步消费者 / 非 web 上下文用。 */
    public static Long idOrNull() {
        try {
            Object loginId = StpUtil.getLoginIdDefaultNull();
            if (loginId == null) return null;
            if (loginId instanceof Long l) return l;
            if (loginId instanceof Number n) return n.longValue();
            return Long.parseLong(loginId.toString());
        } catch (NumberFormatException e) {
            return null;
        } catch (Exception e) {
            // Sa-Token 在非 web 线程或未初始化时会抛异常
            log.debug("StpUtil unavailable: {}", e.getMessage());
            return null;
        }
    }
}
