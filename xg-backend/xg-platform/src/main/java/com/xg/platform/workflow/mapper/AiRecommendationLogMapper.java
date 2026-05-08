package com.xg.platform.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.workflow.model.AiRecommendationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface AiRecommendationLogMapper extends BaseMapper<AiRecommendationLog> {

    @Select("""
            SELECT agreement_state, COUNT(*) AS cnt
              FROM ai_recommendation_log
             WHERE created_at >= NOW() - (#{windowDays}::text || ' days')::interval
             GROUP BY agreement_state
            """)
    List<Map<String, Object>> countByAgreement(@Param("windowDays") int windowDays);

    @Select("""
            SELECT id, task_id, biz_type, biz_id,
                   ai_recommendation, ai_headline, ai_rationale,
                   human_decision, human_comment, approver_id,
                   agreement_state, created_at
              FROM ai_recommendation_log
             WHERE agreement_state = 'disagree'
               AND created_at >= NOW() - (#{windowDays}::text || ' days')::interval
             ORDER BY created_at DESC
             LIMIT #{limit}
            """)
    List<Map<String, Object>> recentDisagreements(@Param("windowDays") int windowDays,
                                                    @Param("limit") int limit);
}
