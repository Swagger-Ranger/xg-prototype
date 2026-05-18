package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 30 天规则效果报表聚合（PRD §14.1）。按 rule_id 分组，service 层再套
 * catalog 名称和治理提示阈值。拆三条查询而非一条大 JOIN：feedback / 拒绝原因
 * 与主表是一对多，JOIN 进主聚合会把 FILTER 计数放大（fan-out）。
 */
@Mapper
public interface CareEffectReportMapper {

    /**
     * 主聚合：60 天窗口扫一次，用 FILTER 切出 30 天 / 60 天子集。
     * 60 天口径只为"60 天无人接单"治理提示服务（PRD §14.1）。
     */
    @Select("""
            SELECT rule_id,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')                           AS triggered_30,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND accepted_at IS NOT NULL) AS accepted_30,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND status = 'resolved')     AS resolved_30,
                   COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'
                                      AND status = 'rejected' AND closed_reason = 'handled_offline')            AS handled_offline_30,
                   AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600.0)
                       FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND closed_at IS NOT NULL)         AS avg_close_hours_30,
                   COUNT(*)                                                                                    AS triggered_60,
                   COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)                                              AS accepted_60
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND created_at >= NOW() - INTERVAL '60 days'
             GROUP BY rule_id
            """)
    List<Map<String, Object>> aggregateByRule(@Param("tenantId") String tenantId);

    /** 30 天误报反馈数（按 rule_id）。task 级 distinct，防一任务多条反馈重复计。 */
    @Select("""
            SELECT ct.rule_id, COUNT(DISTINCT ct.id) AS false_positive_30
              FROM care_task ct
              JOIN care_task_feedback fb ON fb.task_id = ct.id AND fb.tenant_id = ct.tenant_id
             WHERE ct.tenant_id = #{tenantId}
               AND ct.created_at >= NOW() - INTERVAL '30 days'
               AND fb.feedback_type = 'false_positive'
             GROUP BY ct.rule_id
            """)
    List<Map<String, Object>> falsePositiveByRule(@Param("tenantId") String tenantId);

    /** 30 天拒绝原因分布（rule_id × closed_reason）。 */
    @Select("""
            SELECT rule_id, closed_reason, COUNT(*) AS cnt
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND created_at >= NOW() - INTERVAL '30 days'
               AND status = 'rejected'
               AND closed_reason IS NOT NULL
             GROUP BY rule_id, closed_reason
            """)
    List<Map<String, Object>> rejectReasonByRule(@Param("tenantId") String tenantId);
}
