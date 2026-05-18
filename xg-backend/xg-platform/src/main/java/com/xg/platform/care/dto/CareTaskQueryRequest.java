package com.xg.platform.care.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 工作台 / 院系视图共用的查询参数。
 *
 * <p>常见组合：
 * <ul>
 *   <li>辅导员"今日待处理": statuses=[pending], assigneeScope=self, limit=5, sort=severity_desc</li>
 *   <li>辅导员"已接进行中": statuses=[accepted, in_progress], assigneeScope=self</li>
 *   <li>辅导员"本周已完成": statuses=[resolved], since=本周一</li>
 *   <li>院系"需要介入": rescheduleAtLeast=2, includeOverdue=true</li>
 * </ul>
 */
@Getter
@Setter
public class CareTaskQueryRequest extends PageQuery {

    /** 状态枚举多选；空表示不过滤 */
    private List<String> statuses;

    /** 严重度枚举多选 */
    private List<String> severities;

    private Long studentId;

    /** self=仅当前 user 的任务（默认）；all=不限（仅院系 / 学校角色可用） */
    private String assigneeScope = "self";

    /** 院系"需要介入"过滤：rescheduleCount >= 此值 */
    private Integer rescheduleAtLeast;

    /** 是否包含 overdue 状态（默认 true） */
    private Boolean includeOverdue = true;

    /**
     * 排序策略：severity_desc / due_asc / created_desc，多个用逗号；默认 severity_desc,due_asc
     */
    private String sort = "severity_desc,due_asc";
}
