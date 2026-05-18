package com.xg.platform.crisis.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 危机详情的跨模块解析查询。crisis 在 xg-platform，sys_user / student_profile /
 * leave_request / violation_record / punishment 属 xg-business（business→platform
 * 单向依赖，不能反向 import 其 mapper）—— 与 {@link com.xg.platform.care.mapper.CareTaskQueryMapper}
 * 同范式，走原始 {@code @Select} 命中租户表。
 *
 * <p><b>这些查询全部纯 DB、零 AI 依赖</b>：危机详情「区一（处理必须）+ 区二非画像部分」
 * 必须在 AI/规则引擎全挂时仍可渲染（设计 §1「不依赖 AI」+ 项目铁律「AI 可降级」）。
 *
 * <p>两条工程约束沿用 CareTaskQueryMapper：
 * <ul>
 *   <li>显式带 {@code tenant_id = #{tenantId}}：跨租户串名是隐私事故，不依赖租户插件兜底；</li>
 *   <li><b>别名必须双引号</b>：Postgres 不带引号别名折叠成小写，service 按 camelCase 取 Map 会全空。</li>
 * </ul>
 */
@Mapper
public interface CrisisQueryMapper {

    /**
     * 批量解析 studentId → 区一基础信息（姓名/班级/年级/学号/电话）。
     * 调用方需保证 studentIds 非空（空集合会拼出非法 {@code IN ()}）。
     */
    @Select("""
            <script>
            SELECT u.id            AS "studentId",
                   u.real_name     AS "studentName",
                   u.phone         AS "phone",
                   sp.class_name   AS "className",
                   sp.grade        AS "grade",
                   sp.student_no   AS "studentNo"
              FROM sys_user u
              LEFT JOIN student_profile sp
                     ON sp.user_id = u.id AND sp.tenant_id = #{tenantId}
             WHERE u.tenant_id = #{tenantId}
               AND u.id IN
                   <foreach collection="studentIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<Map<String, Object>> resolveStudentCore(@Param("tenantId") String tenantId,
                                                  @Param("studentIds") List<Long> studentIds);

    /** 该生终态关怀次数（resolved/rejected/transferred），区二「近期关怀历史」摘要。 */
    @Select("""
            SELECT COUNT(*)
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
               AND status IN ('resolved','rejected','transferred')
            """)
    int careHistoryCount(@Param("tenantId") String tenantId,
                         @Param("studentId") Long studentId);

    /**
     * 最近若干条关怀任务（区二，纯 DB）。返回 Map 直接序列化给前端 → 列名本身已是
     * snake_case，不加别名以保持与项目全局 SNAKE_CASE JSON 契约一致（Map key 原样输出，
     * Jackson 命名策略不作用于 Map）。
     */
    @Select("""
            SELECT severity, status, closed_reason, created_at
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
             ORDER BY created_at DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> recentCare(@Param("tenantId") String tenantId,
                                         @Param("studentId") Long studentId,
                                         @Param("limit") int limit);

    /** 最近若干条请假记录（区二，纯 DB）。软删除不展示。列名已 snake_case，原样序列化。 */
    @Select("""
            SELECT leave_type_name, start_time, end_time, status, reason, created_at
              FROM leave_request
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
               AND deleted_at IS NULL
             ORDER BY created_at DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> recentLeave(@Param("tenantId") String tenantId,
                                          @Param("studentId") Long studentId,
                                          @Param("limit") int limit);

    /**
     * 最近若干条违纪记录 + 关联处分（区二，纯 DB）。软删除不展示。
     * level/status 在 v、p 两表重名，必须显式 snake_case 别名消歧（其余列原样）。
     */
    @Select("""
            SELECT v.category,
                   v.occurred_at,
                   v.description,
                   v.approval_status,
                   p.level  AS punishment_level,
                   p.status AS punishment_status
              FROM violation_record v
              LEFT JOIN punishment p
                     ON p.id = v.punishment_id AND p.tenant_id = #{tenantId}
             WHERE v.tenant_id = #{tenantId}
               AND v.student_id = #{studentId}
               AND v.deleted_at IS NULL
             ORDER BY v.occurred_at DESC NULLS LAST, v.id DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> recentViolation(@Param("tenantId") String tenantId,
                                               @Param("studentId") Long studentId,
                                               @Param("limit") int limit);

    /**
     * 该生最近一条带 AI brief 的关怀任务的 brief 原文（JSONB→text）。区二「小夕画像」。
     *
     * <p><b>不触发新的 AI 生成</b>：crisis 通道绝不依赖 AI（设计 §1）。这里只「捡」
     * 关怀侧已经算好的画像复用；没有则返回 null，前端优雅降级为「暂无可用画像」，
     * 不影响区一与区二其余纯 DB 内容。
     */
    @Select("""
            SELECT h.brief::text
              FROM care_task t
              JOIN task_ai_brief_history h
                ON h.id = t.current_brief_id AND h.tenant_id = #{tenantId}
             WHERE t.tenant_id = #{tenantId}
               AND t.student_id = #{studentId}
               AND t.current_brief_id IS NOT NULL
             ORDER BY t.created_at DESC
             LIMIT 1
            """)
    String latestStudentBriefJson(@Param("tenantId") String tenantId,
                                  @Param("studentId") Long studentId);
}
