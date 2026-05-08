package com.xg.platform.tenant.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum TenantErrorCode implements ErrorCode {

    TENANT_NOT_FOUND("TENANT_NOT_FOUND", "租户不存在"),
    TENANT_ID_EXISTS("TENANT_ID_EXISTS", "租户ID已存在"),
    TENANT_CODE_EXISTS("TENANT_CODE_EXISTS", "租户编码已存在"),
    TENANT_SCHEMA_EXISTS("TENANT_SCHEMA_EXISTS", "租户Schema名已被占用"),
    INVALID_TENANT_ID("INVALID_TENANT_ID", "租户ID只能包含字母、数字和下划线，长度1-32"),
    INVALID_STATUS("INVALID_TENANT_STATUS", "无效的租户状态"),
    PROVISION_FAILED("TENANT_PROVISION_FAILED", "租户初始化失败");

    private final String code;
    private final String message;
}
