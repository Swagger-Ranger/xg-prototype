package com.xg.platform.auth.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements ErrorCode {

    INVALID_CREDENTIALS("AUTH_INVALID_CREDENTIALS", "用户名或密码错误"),
    USER_DISABLED("AUTH_USER_DISABLED", "账号已被禁用"),
    USER_NOT_FOUND("AUTH_USER_NOT_FOUND", "用户不存在"),
    INVALID_PROFILE("AUTH_INVALID_PROFILE", "资料字段不合法"),
    OLD_PASSWORD_MISMATCH("AUTH_OLD_PASSWORD_MISMATCH", "原密码不正确"),
    WEAK_PASSWORD("AUTH_WEAK_PASSWORD", "新密码长度需在 8-64 位之间"),
    SAME_PASSWORD("AUTH_SAME_PASSWORD", "新密码不能与原密码相同");

    private final String code;
    private final String message;
}
