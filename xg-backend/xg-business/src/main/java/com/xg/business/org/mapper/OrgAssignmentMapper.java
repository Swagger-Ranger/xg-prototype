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
             WHERE o.type IN ('college', 'class', 'admin_dept')
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

    // ===== 新建组织节点(新增院系按钮用) =====

    /** 写 org_unit。code 允许 null。type / parentId 合法性由 service 校验。 */
    @Insert("""
            INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status)
            VALUES (#{id}, #{tenantId}, #{parentId}, #{name}, #{code}, #{type}, #{sortOrder}, 'active')
            """)
    int insertOrgUnit(@Param("id") Long id,
                      @Param("tenantId") String tenantId,
                      @Param("parentId") Long parentId,
                      @Param("name") String name,
                      @Param("code") String code,
                      @Param("type") String type,
                      @Param("sortOrder") Integer sortOrder);

    /**
     * 维护 org_closure:新节点对自身 depth=0 + 继承父链。
     * parentId 非空时用,内部会走 SELECT FROM org_closure 取祖先链。
     */
    @Insert("""
            INSERT INTO org_closure (ancestor_id, descendant_id, depth)
            SELECT ancestor_id, #{newId}, depth + 1
              FROM org_closure
             WHERE descendant_id = #{parentId}
            UNION ALL
            SELECT #{newId}, #{newId}, 0
            ON CONFLICT DO NOTHING
            """)
    int insertOrgClosure(@Param("newId") Long newId,
                         @Param("parentId") Long parentId);

    /** parentId 为 null 时(顶层 college)只写 self-link,避免父查 SELECT 空集导致 UNION 失败。 */
    @Insert("""
            INSERT INTO org_closure (ancestor_id, descendant_id, depth)
            VALUES (#{newId}, #{newId}, 0)
            ON CONFLICT DO NOTHING
            """)
    int insertOrgClosureSelf(@Param("newId") Long newId);

    /**
     * 检查同 parent 下同名重复。parentId 为 null 时只看顶层。
     *
     * <p>显式 tenant_id 过滤,defense-in-depth — 不依赖 MyBatis-Plus 多租户插件对裸
     * `@Select` 的拦截覆盖,防止跨租户重名误判 / 跨租户 leak。
     */
    @Select("""
            <script>
            SELECT COUNT(*)
              FROM org_unit
             WHERE name = #{name}
               AND tenant_id = #{tenantId}
               AND deleted_at IS NULL
               AND status = 'active'
            <choose>
                <when test="parentId == null">AND parent_id IS NULL</when>
                <otherwise>AND parent_id = #{parentId}</otherwise>
            </choose>
            </script>
            """)
    long countByNameAndParent(@Param("name") String name,
                              @Param("parentId") Long parentId,
                              @Param("tenantId") String tenantId);

    /**
     * 查 org_unit 是否存在 + type(parentId 校验时用)。
     * 显式 tenant_id 过滤同上,防跨租户 parentId 越权。
     */
    @Select("""
            SELECT type FROM org_unit
             WHERE id = #{id}
               AND tenant_id = #{tenantId}
               AND deleted_at IS NULL
            """)
    String findOrgType(@Param("id") Long id, @Param("tenantId") String tenantId);

    /**
     * 列出"缺班主任"的班级。collegeId=null 时返回全校；非 null 时只返回 parent_id=collegeId 的班。
     * AI 派班 UI 会按这个结果生成建议表。
     */
    @Select("""
            <script>
            SELECT o.id, o.name
              FROM org_unit o
             WHERE o.type = 'class'
               AND o.status = 'active'
               AND o.deleted_at IS NULL
               AND o.leader_id IS NULL
            <if test="collegeId != null">
               AND o.parent_id = #{collegeId}
            </if>
             ORDER BY o.sort_order NULLS LAST, o.id
            </script>
            """)
    List<Map<String, Object>> listClassesMissingLeader(@Param("collegeId") Long collegeId);

    /**
     * 列出指定角色的全部候选用户，附带"当前已是几个班的 leader_id"作为负载。
     * 没带任何班的人 load=0，前端按 load 升序、id 升序排。AI 推荐取 load 最低者。
     */
    @Select("""
            SELECT u.id, u.real_name, u.username,
                   COALESCE(cnt.c, 0) AS load
              FROM sys_user u
              JOIN sys_user_role ur ON ur.user_id = u.id
              JOIN sys_role r       ON r.id = ur.role_id AND r.code = #{roleCode}
              LEFT JOIN (
                  SELECT leader_id, COUNT(*) AS c
                    FROM org_unit
                   WHERE type = 'class'
                     AND status = 'active'
                     AND deleted_at IS NULL
                     AND leader_id IS NOT NULL
                   GROUP BY leader_id
              ) cnt ON cnt.leader_id = u.id
             WHERE u.status = 'active'
               AND u.deleted_at IS NULL
             ORDER BY load ASC, u.id ASC
            """)
    List<Map<String, Object>> listCandidatesWithLeaderLoad(@Param("roleCode") String roleCode);
}
