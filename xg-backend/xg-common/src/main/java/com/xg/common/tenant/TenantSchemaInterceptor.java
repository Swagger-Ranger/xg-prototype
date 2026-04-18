package com.xg.common.tenant;

import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.sql.Statement;

@Slf4j
@Intercepts({
        @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class}),
        @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
})
public class TenantSchemaInterceptor implements Interceptor {

    private static final java.util.regex.Pattern VALID_SCHEMA = java.util.regex.Pattern.compile("^[a-zA-Z0-9_]{1,64}$");

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        String schemaName = TenantContext.getSchemaName();
        if (schemaName != null && !schemaName.equals("public")) {
            if (!VALID_SCHEMA.matcher(schemaName).matches()) {
                log.warn("Invalid tenant schema name rejected: {}", schemaName);
                return invocation.proceed();
            }
            Executor executor = (Executor) invocation.getTarget();
            try (Statement stmt = executor.getTransaction().getConnection().createStatement()) {
                stmt.execute("SET search_path TO " + schemaName + ", public");
            } catch (Exception e) {
                log.warn("Failed to set search_path to schema: {}", schemaName, e);
            }
        }
        return invocation.proceed();
    }
}
