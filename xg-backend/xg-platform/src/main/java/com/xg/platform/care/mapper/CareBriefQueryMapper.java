package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * AI brief 上下文查询。<b>这是 PRD §11.2「允许输入」的硬边界</b>：
 * SQL 只 SELECT 允许字段，禁止字段（身份证 / 家庭 / 资助 aid_level / 医疗 /
 * 谈话自由文本 / event_data 原文）从源头不出库，不依赖下游裁剪。
 *
 * <p>care 在 xg-platform，student_profile 属 xg-business（business→platform 单向依赖），
 * 不能反向 import 其 model/mapper —— 走原始 @Select 命中租户表，与 CareRuleQueryMapper 同范式。
 * 显式 tenant_id 过滤兜底，不赌租户插件覆盖。
 */
@Mapper
public interface CareBriefQueryMapper {

    /** 学生基础学籍：仅 §11.2 允许子集。刻意不取 aid_level（§9.2：不向 AI 输入资助字段）。 */
    @Select("""
            SELECT grade, college, major, class_name AS className, status
              FROM student_profile
             WHERE tenant_id = #{tenantId}
               AND user_id = #{studentId}
               AND deleted_at IS NULL
            """)
    Map<String, Object> studentBasicInfo(@Param("tenantId") String tenantId,
                                         @Param("studentId") Long studentId);

    /**
     * 近 N 天结构化事件信号。只取 type/source/severity/时间，
     * <b>不取 event_data</b>（JSONB 可能含自由文本，§11.2 禁止谈话原文入 AI）。
     */
    @Select("""
            SELECT event_type AS eventType, event_source AS eventSource,
                   severity, occurred_at AS occurredAt
              FROM student_event_log
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
               AND occurred_at >= #{since}
             ORDER BY occurred_at DESC
             LIMIT 50
            """)
    List<Map<String, Object>> recentStructuredEvents(@Param("tenantId") String tenantId,
                                                     @Param("studentId") Long studentId,
                                                     @Param("since") OffsetDateTime since);

    /** 已关闭关怀历史摘要（聚合，非逐条原文）：rule_id × severity × 关闭原因 计数。 */
    @Select("""
            SELECT rule_id AS ruleId, severity, closed_reason AS closedReason, COUNT(*) AS cnt
              FROM care_task
             WHERE tenant_id = #{tenantId}
               AND student_id = #{studentId}
               AND status IN ('resolved', 'rejected', 'transferred')
             GROUP BY rule_id, severity, closed_reason
            """)
    List<Map<String, Object>> closedCareSummary(@Param("tenantId") String tenantId,
                                                @Param("studentId") Long studentId);
}
