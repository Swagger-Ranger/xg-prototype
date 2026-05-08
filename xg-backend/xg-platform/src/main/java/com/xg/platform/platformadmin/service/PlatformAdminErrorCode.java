package com.xg.platform.platformadmin.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PlatformAdminErrorCode implements ErrorCode {

    INVALID_CREDENTIALS("PLATFORM_INVALID_CREDENTIALS", "用户名或密码错误"),
    ADMIN_DISABLED("PLATFORM_ADMIN_DISABLED", "账号已被停用"),
    ADMIN_NOT_FOUND("PLATFORM_ADMIN_NOT_FOUND", "管理员不存在"),
    USERNAME_EXISTS("PLATFORM_USERNAME_EXISTS", "用户名已存在"),
    OLD_PASSWORD_MISMATCH("PLATFORM_OLD_PASSWORD_MISMATCH", "原密码错误"),
    WEAK_PASSWORD("PLATFORM_WEAK_PASSWORD", "新密码长度需在 8-64 位之间"),
    SAME_PASSWORD("PLATFORM_SAME_PASSWORD", "新密码不能与原密码相同"),
    CANNOT_DELETE_SELF("PLATFORM_CANNOT_DELETE_SELF", "不能删除自己"),
    CANNOT_DELETE_LAST("PLATFORM_CANNOT_DELETE_LAST", "至少保留一个有效平台管理员");

    private final String code;
    private final String message;
}
