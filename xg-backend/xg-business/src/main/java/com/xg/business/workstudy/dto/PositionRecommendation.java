package com.xg.business.workstudy.dto;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 单个推荐岗位项 — 学生侧"为你推荐"卡片用。score 是 Java 确定性打分，
 * reason 是 AI 后置写的 1-2 句友好理由（sidecar 失败时为空）。
 */
@Getter
@Setter
public class PositionRecommendation {

    private Long positionId;
    private String title;
    private String departmentName;
    private String campus;
    private String workLocation;
    private String salaryUnit;
    private BigDecimal salaryAmount;
    private BigDecimal hourlyRate;
    private Integer weeklyHours;
    private Integer headcount;
    private Integer hiredCount;
    private String financialAidPolicy;
    private Integer reservedCount;

    /** Java 确定性评分（0-100）；越高越匹配 */
    private double score;

    /** AI 生成的友好理由；sidecar 失败时为空字符串，前端 fallback 展示评分 tags */
    private String reason;

    /** 评分维度摘要，喂给 AI 生成 reason；前端可选展示 */
    private Map<String, Object> scoringSignals = new LinkedHashMap<>();
}
