package com.xg.common.tenant;

import com.alibaba.ttl.TransmittableThreadLocal;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;

public final class TenantContext {

    private static final TransmittableThreadLocal<String> TENANT_ID = new TransmittableThreadLocal<>();
    private static final TransmittableThreadLocal<String> SCHEMA_NAME = new TransmittableThreadLocal<>();

    private TenantContext() {
    }

    public static void setTenantId(String tenantId) {
        TENANT_ID.set(tenantId);
    }

    public static String getTenantId() {
        return TENANT_ID.get();
    }

    public static String getRequiredTenantId() {
        String tenantId = TENANT_ID.get();
        if (tenantId == null) {
            throw GlobalErrorCode.TENANT_NOT_FOUND.exception();
        }
        return tenantId;
    }

    public static void setSchemaName(String schemaName) {
        SCHEMA_NAME.set(schemaName);
    }

    public static String getSchemaName() {
        return SCHEMA_NAME.get();
    }

    public static void clear() {
        TENANT_ID.remove();
        SCHEMA_NAME.remove();
    }
}
