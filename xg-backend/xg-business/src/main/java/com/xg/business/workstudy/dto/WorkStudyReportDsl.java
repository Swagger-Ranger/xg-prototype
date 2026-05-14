package com.xg.business.workstudy.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/**
 * A4 — 勤工助学报表 DSL（最小可用版本）。
 *
 * <p>P0 仅支持 entity=application。filters / columns 走白名单。group_by 在 P0 不支持。
 * AI 生成的标题 + 摘要会一同传过来；title 写到 sheet 名 / 文件名，summary 写到表头上方。
 *
 * <pre>
 * {
 *   "title":   "本月已录用申请",
 *   "summary": "AI 写的趋势文字",
 *   "entity":  "application",
 *   "filters": { "status": "hired", "from_date": "2026-05-01" },
 *   "columns": ["student_name", "position_title", "decided_at"]
 * }
 * </pre>
 */
@Getter
@Setter
public class WorkStudyReportDsl {

    /** 报表标题（中文，作为 sheet 名 + 文件名一部分）。 */
    private String title;

    /** AI 写的趋势摘要，可空。 */
    private String summary;

    /** 实体类型；P0 仅 "application"。 */
    private String entity;

    /** 过滤条件（白名单，详见 ALLOWED_FILTERS）。 */
    private Map<String, Object> filters = new LinkedHashMap<>();

    /** 列（白名单，详见 ALLOWED_COLUMNS）。 */
    private List<String> columns = new LinkedList<>();
}
