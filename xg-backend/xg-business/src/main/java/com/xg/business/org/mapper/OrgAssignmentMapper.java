package com.xg.business.org.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * 派班 / 辅导员映射的低层 SQL。
 *
 * <p>org_unit.leader_id 与 counselor_org_mapping 是两条独立的指派路径——前者是
 * 班级 → 班主任 1:1，后者是辅导员 → 班级/学院 N:N（通过 is_primary 区分主辅）。
 * 所有查询都通过 MyBatis-Plus 多租户插件自动加 tenant_id 谓词，这里只写业务逻辑。
 */
@Mapper
public interface OrgAssignmentMapper {

    /** 列出全部 active org_unit（college + class），含 leader_id 和 leader_name。 */
    @Select("""
            SELECT o.id, o.parent_id, o.name, o.type, o.sort_order,
                   o.leader_id, u.real_name AS leader_name
              FROM org_unit o
              LEFT JOIN sys_user u ON u.id = o.leader_id
                                  AND u.status = 'active'
                                  AND u.deleted_at IS NULL
             WHERE o.type IN ('college', 'class')
               AND o.status = 'active'
               AND o.deleted_at IS NULL
             ORDER BY o.sort_order NULLS LAST, o.id
            """)
    List<Map<String, Object>> listOrgUnits();

    /** 根据角色 code 查可指派的用户（class_master / counselor）。 */
    @Select("""
            SELECT u.id, u.real_name, u.username
              FROM sys_user u
              JOIN sys_user_role ur ON ur.user_id = u.id
              JOIN sys_role r       ON r.id = ur.role_id AND r.code = #{roleCode}
             WHERE u.status = 'active'
               AND u.deleted_at IS NULL
             ORDER BY u.id
            """)
    List<Map<String, Object>> listUsersByRoleCode(@Param("roleCode") String roleCode);

    /** 设/清班主任。leaderId 可为 null（清空）。 */
    @Update("""
            UPDATE org_unit
               SET leader_id = #{leaderId},
                   updated_at = NOW()
             WHERE id = #{classId}
               AND type = 'class'
               AND deleted_at IS NULL
            """)
    int updateLeader(@Param("classId") Long classId,
                     @Param("leaderId") Long leaderId);

    /** 验证用户是否拥有指定角色（写指派前的安全检查）。 */
    @Select("""
            SELECT COUNT(1)
              FROM sys_user_role ur
              JOIN sys_role r ON r.id = ur.role_id AND r.code = #{roleCode}
              JOIN sys_user u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
             WHERE ur.user_id = #{userId}
            """)
    long countUserWithRole(@Param("userId") Long userId,
                           @Param("roleCode") String roleCode);

    /** 查指定 org（college 或 class）下的辅导员映射。 */
    @Select("""
            SELECT m.id, m.counselor_id, u.real_name AS counselor_name,
                   m.org_id, o.name AS org_name, o.type AS org_type, m.is_primary
              FROM counselor_org_mapping m
              JOIN sys_user u ON u.id = m.counselor_id
              JOIN org_unit o ON o.id = m.org_id
             WHERE m.org_id = #{orgId}
             ORDER BY m.is_primary DESC, m.id
            """)
    List<Map<String, Object>> listMappingsByOrg(@Param("orgId") Long orgId);

    /** 全部辅导员映射，前端按 org 分组渲染（小数据量场景，全量返回）。 */
    @Select("""
            SELECT m.id, m.counselor_id, u.real_name AS counselor_name,
                   m.org_id, o.name AS org_name, o.type AS org_type, m.is_primary
              FROM counselor_org_mapping m
              JOIN sys_user u ON u.id = m.counselor_id
              JOIN org_unit o ON o.id = m.org_id
             ORDER BY m.org_id, m.is_primary DESC, m.id
            """)
    List<Map<String, Object>> listAllMappings();

    /** 创建辅导员映射。id 由 service 用 IdWorker 雪花生成传入（表无 sequence default）。 */
    @Insert("""
            INSERT INTO counselor_org_mapping
                (id, tenant_id, counselor_id, org_id, is_primary, created_by, created_at)
            VALUES
                (#{id}, #{tenantId}, #{counselorId}, #{orgId}, #{isPrimary}, #{createdBy}, NOW())
            """)
    int insertMapping(@Param("id") Long id,
                      @Param("tenantId") String tenantId,
                      @Param("counselorId") Long counselorId,
                      @Param("orgId") Long orgId,
                      @Param("isPrimary") Boolean isPrimary,
                      @Param("createdBy") Long createdBy);

    /** 改 is_primary（不允许改 counselor / org，要换人就先 delete 再 insert）。 */
    @Update("""
            UPDATE counselor_org_mapping
               SET is_primary = #{isPrimary}
             WHERE id = #{id}
            """)
    int updateMappingPrimary(@Param("id") Long id,
                             @Param("isPrimary") Boolean isPrimary);

    /** 删除辅导员映射。 */
    @Delete("DELETE FROM counselor_org_mapping WHERE id = #{id}")
    int deleteMapping(@Param("id") Long id);

    /** 检查重复（同一 counselor 已经挂在同一 org 上）。unique constraint 也会兜底。 */
    @Select("""
            SELECT COUNT(1)
              FROM counselor_org_mapping
             WHERE counselor_id = #{counselorId}
               AND org_id = #{orgId}
            """)
    long countByCounselorAndOrg(@Param("counselorId") Long counselorId,
                                @Param("orgId") Long orgId);
}
