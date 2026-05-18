package com.xg.common.tenant;

import com.xg.common.exception.BizException;
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
            // 非法 schema 必须 fail-fast：连接池里 search_path 是连接级状态，
            // "继续执行" 会让查询落到上一条连接残留的 schema 上（可能是别的租户）。
            if (!VALID_SCHEMA.matcher(schemaName).matches()) {
                log.warn("Invalid tenant schema name rejected: {}", schemaName);
                throw new BizException("INVALID_TENANT_SCHEMA", "非法租户 schema");
            }
            Executor executor = (Executor) invocation.getTarget();
            try (Statement stmt = executor.getTransaction().getConnection().createStatement()) {
                stmt.execute("SET search_path TO " + schemaName + ", public");
            } catch (Exception e) {
                // SET 失败不能吞：吞掉等于带着错误的 search_path 跑业务 SQL。
                log.warn("Failed to set search_path to schema: {}", schemaName, e);
                throw new BizException("TENANT_SCHEMA_SET_FAILED", "切换租户 schema 失败");
            }
        }
        return invocation.proceed();
    }
}
