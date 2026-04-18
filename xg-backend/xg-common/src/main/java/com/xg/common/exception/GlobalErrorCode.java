package com.xg.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum GlobalErrorCode implements ErrorCode {

    SUCCESS("SUCCESS", "成功"),
    INTERNAL_ERROR("INTERNAL_ERROR", "系统内部错误"),
    BAD_REQUEST("BAD_REQUEST", "请求参数错误"),
    UNAUTHORIZED("UNAUTHORIZED", "未登录或登录已过期"),
    FORBIDDEN("FORBIDDEN", "无权限访问"),
    NOT_FOUND("NOT_FOUND", "资源不存在"),
    CONFLICT("CONFLICT", "数据冲突"),
    RATE_LIMITED("RATE_LIMITED", "请求过于频繁"),
    TENANT_NOT_FOUND("TENANT_NOT_FOUND", "租户不存在"),
    TENANT_DISABLED("TENANT_DISABLED", "租户已禁用");

    private final String code;
    private final String message;
}
