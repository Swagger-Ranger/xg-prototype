package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 院系/学校管理视图聚合（PRD §5.2 / §6.2 / §13.2）。范围 = 当前 schema 整租户
 * （P0 dean 也看本校全部，本院收窄留 P1）。所有语句显式带 tenant_id。
 *
 * <p>别名一律小写下划线：Postgres 折叠未引号别名为小写，service 按小写 key 取
 * Map，绕开大小写折叠坑（见 {@link CareTaskQueryMapper} 注释）。
 */
@Mapper
public interface CareAdminQueryMapper {

    /** 本周汇总单行：总数/完成/进行中 按 created_at>=weekStart；overdue 取当前状态。 */
    @Select("""
            SELECT
              COUNT(*) FILTER (WHERE created_at >= #{weekStart})                                AS total,
              COUNT(*) FILTER (WHERE created_at >= #{weekStart} AND status = 'resolved')          AS done,
              COUNT(*) FILTER (WHERE created_at >= #{weekStart}
                                 AND status IN ('accepted','in_progress'))                       AS in_progress,
              COUNT(*) FILTER (WHERE status = 'overdue')                                         AS overdue
              FROM care_task
             WHERE tenant_id = #{tenantId}
            """)
    Map<String, Object> summaryCounts(@Param("tenantId") String tenantId,
                                      @Param("weekStart") OffsetDateTime weekStart);

    /** 本周触发最多规则（rule_id + 命中数）；service 映中文名，不点名学生/辅导员。 */
    @Select("""
            SELECT rule_id, COUNT(*) AS cnt
              FROM care_task
             WHERE tenant_id = #{tenantId} AND created_at >= #{weekStart}
             GROUP BY rule_id
             ORDER BY cnt DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> topRules(@Param("tenantId") String tenantId,
                                       @Param("weekStart") OffsetDateTime weekStart,
                                       @Param("limit") int limit);

    /** 本周严重度分布。 */
    @Select("""
            SELECT severity, COUNT(*) AS cnt
              FROM care_task
             WHERE tenant_id = #{tenantId} AND created_at >= #{weekStart}
             GROUP BY severity
            """)
    List<Map<String, Object>> severityDist(@Param("tenantId") String tenantId,
                                           @Param("weekStart") OffsetDateTime weekStart);

    @Select("SELECT COUNT(*) FROM care_task WHERE tenant_id = #{tenantId} AND status = 'overdue'")
    long countOverdue(@Param("tenantId") String tenantId);

    /**
     * 超期任务分页：学生姓名 + 班级 + 任务类型（category）+ 严重度 + due_at。
     * <b>不返回责任辅导员</b>（PRD §5.2：领导只看学生与类型，不点名辅导员）。
     */
    @Select("""
            SELECT ct.id AS task_id,
                   ct.severity AS severity,
                   ct.trigger_data->>'category' AS category,
                   ct.due_at AS due_at,
                   u.real_name AS student_name,
                   sp.class_name AS class_name
              FROM care_task ct
              JOIN sys_user u ON u.id = ct.student_id AND u.tenant_id = #{tenantId}
              LEFT JOIN student_profile sp
                     ON sp.user_id = ct.student_id AND sp.tenant_id = #{tenantId}
             WHERE ct.tenant_id = #{tenantId} AND ct.status = 'overdue'
             ORDER BY ct.due_at ASC
             LIMIT #{size} OFFSET #{offset}
            """)
    List<Map<String, Object>> overduePage(@Param("tenantId") String tenantId,
                                          @Param("offset") int offset,
                                          @Param("size") int size);

    /** 规则趋势：按自然周分桶 × rule_id 计数（service 映中文名 + 拼折线序列）。 */
    @Select("""
            SELECT date_trunc('week', created_at) AS week_start,
                   rule_id,
                   COUNT(*) AS cnt
              FROM care_task
             WHERE tenant_id = #{tenantId} AND created_at >= #{since}
             GROUP BY 1, rule_id
             ORDER BY 1 ASC
            """)
    List<Map<String, Object>> trends(@Param("tenantId") String tenantId,
                                     @Param("since") OffsetDateTime since);

    // ─────────────────── 下钻 ───────────────────

    /** 当日某用户已下钻次数（配额判定，PRD §13.2）。 */
    @Select("""
            SELECT COUNT(*)
              FROM care_task_audit
             WHERE tenant_id = #{tenantId}
               AND action = 'drilled_down'
               AND actor_id = #{actorId}
               AND created_at >= #{dayStart}
            """)
    int countDrillToday(@Param("tenantId") String tenantId,
                        @Param("actorId") Long actorId,
                        @Param("dayStart") OffsetDateTime dayStart);

    /** 下钻日志分页：谁、何时、对谁、理由。actor 解析姓名，不暴露被下钻给学生。 */
    @Select("""
            SELECT a.actor_id AS actor_id,
                   a.actor_role AS actor_role,
                   au.real_name AS actor_name,
                   a.payload->>'student_id' AS student_id,
                   a.payload->>'reason' AS reason,
                   a.created_at AS created_at
              FROM care_task_audit a
              LEFT JOIN sys_user au ON au.id = a.actor_id AND au.tenant_id = #{tenantId}
             WHERE a.tenant_id = #{tenantId} AND a.action = 'drilled_down'
             ORDER BY a.created_at DESC
             LIMIT #{size} OFFSET #{offset}
            """)
    List<Map<String, Object>> drillLogPage(@Param("tenantId") String tenantId,
                                            @Param("offset") int offset,
                                            @Param("size") int size);

    @Select("""
            SELECT COUNT(*) FROM care_task_audit
             WHERE tenant_id = #{tenantId} AND action = 'drilled_down'
            """)
    long countDrillLog(@Param("tenantId") String tenantId);

    /** 被下钻学生近 90 天任务摘要（category/severity/status，不泄 rule_id）。 */
    @Select("""
            SELECT id AS task_id,
                   trigger_data->>'category' AS category,
                   severity AS severity,
                   status AS status,
                   created_at AS created_at,
                   closed_at AS closed_at
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
               AND created_at >= #{since}
             ORDER BY created_at DESC
            """)
    List<Map<String, Object>> drilledStudentTasks(@Param("tenantId") String tenantId,
                                                   @Param("studentId") Long studentId,
                                                   @Param("since") OffsetDateTime since);

    /** 被下钻学生近 90 天审计（PRD §5.3）。join task 把该生所有任务的留痕拉齐。 */
    @Select("""
            SELECT a.action AS action,
                   a.from_status AS from_status,
                   a.to_status AS to_status,
                   a.actor_role AS actor_role,
                   a.created_at AS created_at
              FROM care_task_audit a
              JOIN care_task ct ON ct.id = a.task_id AND ct.tenant_id = #{tenantId}
             WHERE a.tenant_id = #{tenantId}
               AND ct.student_id = #{studentId}
               AND a.created_at >= #{since}
             ORDER BY a.created_at DESC
            """)
    List<Map<String, Object>> drilledStudentAudit(@Param("tenantId") String tenantId,
                                                   @Param("studentId") Long studentId,
                                                   @Param("since") OffsetDateTime since);

    // ─────────────────── 异常审计 scheduler ───────────────────

    /** 持某角色 code 的用户 id（学工部部长收异常摘要，复用 applicant slot 推送）。 */
    @Select("""
            SELECT u.id
              FROM sys_user u
              JOIN sys_user_role ur ON ur.user_id = u.id
              JOIN sys_role r ON r.id = ur.role_id
             WHERE u.tenant_id = #{tenantId} AND r.code = #{roleCode}
            """)
    List<Long> roleHolderIds(@Param("tenantId") String tenantId,
                             @Param("roleCode") String roleCode);

    /** [since,until) 内各 actor 下钻次数（异常检测：本周 vs 4 周均值）。 */
    @Select("""
            SELECT actor_id, COUNT(*) AS cnt
              FROM care_task_audit
             WHERE tenant_id = #{tenantId}
               AND action = 'drilled_down'
               AND created_at >= #{since} AND created_at < #{until}
             GROUP BY actor_id
            """)
    List<Map<String, Object>> drillCountByActor(@Param("tenantId") String tenantId,
                                                 @Param("since") OffsetDateTime since,
                                                 @Param("until") OffsetDateTime until);

    /** 近 30 天 (actor, student) 下钻 >= minCount 的高频对。 */
    @Select("""
            SELECT actor_id,
                   payload->>'student_id' AS student_id,
                   COUNT(*) AS cnt
              FROM care_task_audit
             WHERE tenant_id = #{tenantId}
               AND action = 'drilled_down'
               AND created_at >= #{since}
             GROUP BY actor_id, payload->>'student_id'
            HAVING COUNT(*) >= #{minCount}
            """)
    List<Map<String, Object>> drillHighFreqPairs(@Param("tenantId") String tenantId,
                                                  @Param("since") OffsetDateTime since,
                                                  @Param("minCount") int minCount);
}
