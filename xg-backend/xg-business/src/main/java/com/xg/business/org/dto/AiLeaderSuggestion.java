package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * AI 推荐的一条班主任指派建议。前端在表格里展示时把 recommendedLeaderId 预选进
 * Select；用户可以改人或取消勾选，最终批量调 batch-apply。
 *
 * <p>recommendedLeaderId 为 null 表示"无可派人选"（库里没有任何 class_master 角色用户）；
 * 这时该行在前端显示 disabled，reason 解释原因。
 */
@Getter
@Setter
public class AiLeaderSuggestion {
    private Long classId;
    private String className;
    private Long recommendedLeaderId;
    private String recommendedLeaderName;
    private String reason;
}
