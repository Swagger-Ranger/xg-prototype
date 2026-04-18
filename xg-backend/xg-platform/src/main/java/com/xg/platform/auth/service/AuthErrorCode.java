package com.xg.platform.auth.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements ErrorCode {

    INVALID_CREDENTIALS("AUTH_INVALID_CREDENTIALS", "用户名或密码错误"),
    USER_DISABLED("AUTH_USER_DISABLED", "账号已被禁用"),
    USER_NOT_FOUND("AUTH_USER_NOT_FOUND", "用户不存在");

    private final String code;
    private final String message;
}
