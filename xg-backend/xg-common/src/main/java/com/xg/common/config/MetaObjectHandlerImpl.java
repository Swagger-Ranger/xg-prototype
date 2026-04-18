package com.xg.common.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.xg.common.tenant.TenantContext;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

@Component
public class MetaObjectHandlerImpl implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        OffsetDateTime now = OffsetDateTime.now();
        this.strictInsertFill(metaObject, "createdAt", OffsetDateTime.class, now);
        this.strictInsertFill(metaObject, "updatedAt", OffsetDateTime.class, now);
        // Auto-fill tenantId from TenantContext if the field exists and is null
        if (metaObject.hasSetter("tenantId") && getFieldValByName("tenantId", metaObject) == null) {
            String tenantId = TenantContext.getTenantId();
            if (tenantId != null) {
                this.setFieldValByName("tenantId", tenantId, metaObject);
            }
        }
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        this.strictUpdateFill(metaObject, "updatedAt", OffsetDateTime.class, OffsetDateTime.now());
    }
}
