package com.xg.platform.system.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum SystemUserErrorCode implements ErrorCode {

    USER_NOT_FOUND("USER_NOT_FOUND", "用户不存在"),
    USERNAME_EXISTS("USERNAME_EXISTS", "用户名已存在"),
    ROLE_NOT_FOUND("ROLE_NOT_FOUND", "角色不存在");

    private final String code;
    private final String message;
}
