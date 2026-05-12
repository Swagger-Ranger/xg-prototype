package com.xg.platform.queryguard;

import lombok.Builder;

import java.util.List;

/**
 * 一次 QueryGuard 调用的上下文。tenantId 由 schema 切换自动 enforce(JDBC 连接级),
 * 不参与 SQL 列过滤;真正在 SQL 上做的是 ownerRole 对应的列级 scope 注入。
 *
 * <p>角色 placeholder 替换约定:
 * <ul>
 *   <li>{@code :owner_id} → ownerId(Long)</li>
 *   <li>{@code :owner_college} → ownerCollege(String,dean 用,可空则跳过本表 scope)</li>
 *   <li>{@code :counselor_classes} → counselorClasses(List&lt;Long&gt;,IN 子句展开)</li>
 * </ul>
 *
 * <p>占位符未替换或值为空时,QueryGuard 对该表 scope 子句**保守 reject**整次查询
 * (不能让 dean 没设 college 就退化为全表扫描)。
 */
@Builder
public record ExecContext(
        String tenantId,
        Long ownerId,
        String ownerRole,
        String ownerCollege,
        List<Long> counselorClasses,
        boolean bypassCache
) {
}
