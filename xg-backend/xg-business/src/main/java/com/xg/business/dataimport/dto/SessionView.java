package com.xg.business.dataimport.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.Map;

/**
 * 向导各步骤回前端的统一视图。字段全可空 —— 前端按 status 决定渲染哪一步。
 * id 用 String，避免 JS Long 精度丢失（项目里通用做法）。
 */
@Getter
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SessionView {

    private String id;
    private String scenario;
    private String status;
    private String fileName;
    private Integer totalRows;
    private String intentText;
    private String mappingIntent;
    private String errorMessage;

    /** Step 1 完成后才有：表头 + 前 5 行样例。完整 rows 不发给前端（太大）。 */
    private List<String> headers;
    private List<List<String>> samples;

    private Map<String, Object> columnMapping;
    private Map<String, Object> orgPreview;
    private Map<String, Object> validationReport;
    private Map<String, Object> strategy;
    private Map<String, Object> resultSummary;
}
