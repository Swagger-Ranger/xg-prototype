package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * AI 班主任推荐入参。
 *
 * <p>scope 取值：
 * <ul>
 *   <li>{@code missing_leader_global} —— 全校缺班主任的班级</li>
 *   <li>{@code missing_leader_college} —— 仅 parent_id=collegeId 学院下缺班主任的班级</li>
 * </ul>
 * 后者要求 {@code collegeId} 非空。
 */
@Getter
@Setter
public class AiLeaderSuggestRequest {
    private String scope;
    private Long collegeId;
}
