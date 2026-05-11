package com.xg.business.metrics.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Scope 解析专用查询。MetricsScopeResolver 用,只读、不动业务表。
 *
 * <p>院长跟"我管哪个学院"通过 {@code sys_user_role.role_id=4 + org_id=college}
 * 关联,跟现有 AssigneeLookupMapper.findDeansOfStudent 反向。
 */
@Mapper
public interface MetricsScopeMapper {

    /**
     * 拿院长所管理的 college 的 org_unit.id + name。一个 dean 通常只绑一个学院,
     * 多绑场景(跨学院兼任)取第一个 — P0 不为兼任院长场景做"切学院"切换。
     */
    @Select("""
            SELECT ou.id, ou.name
              FROM sys_user_role ur
              JOIN org_unit ou ON ou.id = ur.org_id
                              AND ou.type = 'college'
                              AND ou.deleted_at IS NULL
             WHERE ur.user_id = #{userId}
               AND ur.role_id = 4
             ORDER BY ou.id
             LIMIT 1
            """)
    java.util.Map<String, Object> findManagedCollege(@Param("userId") Long userId);
}
