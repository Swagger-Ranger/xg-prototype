package com.xg.platform.insight.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.insight.model.WorkspaceInsight;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface WorkspaceInsightMapper extends BaseMapper<WorkspaceInsight> {

    /**
     * Fetch the latest ready insight for a role + scope.
     */
    @Select("""
            SELECT * FROM workspace_insight
             WHERE role = #{role}
               AND scope_key = #{scopeKey}
               AND status = 'ready'
             ORDER BY generated_at DESC
             LIMIT 1
            """)
    WorkspaceInsight findLatest(@Param("role") String role, @Param("scopeKey") String scopeKey);
}
