package com.xg.platform.insight.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.insight.model.InsightFeedback;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface InsightFeedbackMapper extends BaseMapper<InsightFeedback> {

    /**
     * Aggregated up/down counts for a given insight row, grouped by item_index.
     * Returns: [{item_index, up_count, down_count}, ...]
     */
    @Select("""
            SELECT item_index AS itemIndex,
                   SUM(CASE WHEN action = 'up'   THEN 1 ELSE 0 END) AS upCount,
                   SUM(CASE WHEN action = 'down' THEN 1 ELSE 0 END) AS downCount
              FROM insight_feedback
             WHERE insight_id = #{insightId}
             GROUP BY item_index
            """)
    List<FeedbackCount> countByInsight(@Param("insightId") Long insightId);

    @Select("""
            SELECT item_index AS itemIndex, action
              FROM insight_feedback
             WHERE insight_id = #{insightId}
               AND user_id = #{userId}
            """)
    List<UserVote> listUserVotes(@Param("insightId") Long insightId,
                                 @Param("userId") Long userId);

    @Update("""
            INSERT INTO insight_feedback
                (tenant_id, insight_id, item_index, user_id, action, created_at, updated_at)
            VALUES
                (#{tenantId}, #{insightId}, #{itemIndex}, #{userId}, #{action}, NOW(), NOW())
            ON CONFLICT (insight_id, item_index, user_id)
            DO UPDATE SET action = EXCLUDED.action, updated_at = NOW()
            """)
    int upsert(@Param("tenantId") String tenantId,
               @Param("insightId") Long insightId,
               @Param("itemIndex") Integer itemIndex,
               @Param("userId") Long userId,
               @Param("action") String action);

    class FeedbackCount {
        public Integer itemIndex;
        public Long upCount;
        public Long downCount;
    }

    class UserVote {
        public Integer itemIndex;
        public String action;
    }
}
