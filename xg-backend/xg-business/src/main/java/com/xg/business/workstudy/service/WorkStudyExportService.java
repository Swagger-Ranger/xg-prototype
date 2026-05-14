package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.WorkStudyReportDsl;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.common.exception.BizException;
import com.xg.platform.export.ExcelExportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * A4 勤工助学导出（application 实体）。两条路径：
 * <ul>
 *   <li>{@link #exportApplicationsCurrentView} — 当前筛选视图直接出 Excel（与 listApplications 同筛选语义）</li>
 *   <li>{@link #exportByDsl} — AI 生成的 DSL，白名单 filters/columns，附 AI 摘要</li>
 * </ul>
 *
 * <p>导出上限：5000 行硬上限（超过会截断 + 日志告警）。P0 不分页分批。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudyExportService {

    private static final int MAX_ROWS = 5000;

    private final WorkStudyApplicationMapper applicationMapper;
    private final WorkStudyPositionMapper positionMapper;
    private final ExcelExportService excelExportService;

    /** 列定义：key → (header label, value extractor)。决定 DSL columns 可选项 + 默认列序。 */
    private static final Map<String, ColumnDef> COLUMN_REGISTRY = buildColumnRegistry();

    /** filter 白名单 — DSL filters 只允许这些 key，避免 SQL 注入 / 任意字段查询。 */
    private static final Set<String> ALLOWED_FILTERS = Set.of(
            "status", "engagement_status", "position_id", "student_id",
            "from_date", "to_date", "month", "academic_year");

    private static final Map<String, String> STATUS_LABELS = Map.of(
            "pending", "审批中",
            "recommended", "已推荐",
            "hired", "已录用",
            "rejected", "未通过");

    private static final Map<String, String> ENGAGEMENT_LABELS = Map.of(
            "on_duty", "在岗",
            "offboarded", "已离岗");

    private static final Map<String, String> OFFBOARD_REASON_LABELS = Map.of(
            "completed", "任期到期",
            "terminated_by_employer", "单位终止",
            "resigned_by_student", "主动离岗");

    public byte[] exportApplicationsCurrentView(ApplicationQueryRequest query) {
        LambdaQueryWrapper<WorkStudyApplication> wrapper = new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(query.getPositionId() != null, WorkStudyApplication::getPositionId, query.getPositionId())
                .eq(query.getStudentId() != null, WorkStudyApplication::getStudentId, query.getStudentId())
                .eq(query.getStatus() != null, WorkStudyApplication::getStatus, query.getStatus())
                .orderByDesc(WorkStudyApplication::getCreatedAt)
                .last("LIMIT " + MAX_ROWS);
        List<WorkStudyApplication> apps = applicationMapper.selectList(wrapper);
        attachPositionTitles(apps);

        List<String> columns = List.of(
                "id", "student_name", "position_title", "status",
                "engagement_status", "decided_at", "engaged_at",
                "offboarded_at", "offboard_reason", "created_at");
        return buildExcel("勤工助学申请", null, columns, apps);
    }

    public byte[] exportByDsl(WorkStudyReportDsl dsl) {
        if (dsl == null || dsl.getEntity() == null) {
            throw new BizException("EXPORT_INVALID_DSL", "DSL 缺少 entity");
        }
        if (!"application".equals(dsl.getEntity())) {
            throw new BizException("EXPORT_UNSUPPORTED_ENTITY", "P0 仅支持 application 实体");
        }
        List<String> columns = dsl.getColumns() == null || dsl.getColumns().isEmpty()
                ? List.copyOf(COLUMN_REGISTRY.keySet())
                : dsl.getColumns();
        // 列白名单过滤
        List<String> safeColumns = new ArrayList<>();
        for (String c : columns) if (COLUMN_REGISTRY.containsKey(c)) safeColumns.add(c);
        if (safeColumns.isEmpty()) {
            throw new BizException("EXPORT_EMPTY_COLUMNS", "无合法列");
        }

        LambdaQueryWrapper<WorkStudyApplication> wrapper = buildWrapperFromFilters(dsl.getFilters());
        wrapper.orderByDesc(WorkStudyApplication::getCreatedAt).last("LIMIT " + MAX_ROWS);
        List<WorkStudyApplication> apps = applicationMapper.selectList(wrapper);
        attachPositionTitles(apps);

        String title = dsl.getTitle() == null || dsl.getTitle().isBlank()
                ? "勤工助学报表" : dsl.getTitle();
        return buildExcel(title, dsl.getSummary(), safeColumns, apps);
    }

    private LambdaQueryWrapper<WorkStudyApplication> buildWrapperFromFilters(Map<String, Object> filters) {
        LambdaQueryWrapper<WorkStudyApplication> wrapper = new LambdaQueryWrapper<>();
        if (filters == null) return wrapper;
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            String key = e.getKey();
            if (!ALLOWED_FILTERS.contains(key)) {
                log.warn("ignore unknown export filter '{}'", key);
                continue;
            }
            Object value = e.getValue();
            if (value == null) continue;
            switch (key) {
                case "status" -> wrapper.eq(WorkStudyApplication::getStatus, value.toString());
                case "engagement_status" -> wrapper.eq(WorkStudyApplication::getEngagementStatus, value.toString());
                case "position_id" -> wrapper.eq(WorkStudyApplication::getPositionId, toLong(value));
                case "student_id" -> wrapper.eq(WorkStudyApplication::getStudentId, toLong(value));
                case "from_date" -> wrapper.ge(WorkStudyApplication::getCreatedAt, parseDateAsStart(value));
                case "to_date" -> wrapper.le(WorkStudyApplication::getCreatedAt, parseDateAsEnd(value));
                case "month" -> {
                    LocalDate[] range = parseMonth(value);
                    if (range != null) {
                        wrapper.ge(WorkStudyApplication::getCreatedAt, range[0].atStartOfDay().atOffset(ZoneOffset.UTC));
                        wrapper.lt(WorkStudyApplication::getCreatedAt, range[1].atStartOfDay().atOffset(ZoneOffset.UTC));
                    }
                }
                case "academic_year" -> {
                    // academic_year 在 position 上，先查 position id 列表再 in
                    List<WorkStudyPosition> ps = positionMapper.selectList(new LambdaQueryWrapper<WorkStudyPosition>()
                            .eq(WorkStudyPosition::getAcademicYear, value.toString())
                            .select(WorkStudyPosition::getId));
                    if (ps.isEmpty()) {
                        // 没有匹配岗位 → 永远查不到结果
                        wrapper.apply("1=0");
                    } else {
                        wrapper.in(WorkStudyApplication::getPositionId, ps.stream().map(WorkStudyPosition::getId).toList());
                    }
                }
            }
        }
        return wrapper;
    }

    private byte[] buildExcel(String title, String summary, List<String> columns, List<WorkStudyApplication> apps) {
        List<String> headers = new ArrayList<>();
        for (String c : columns) headers.add(COLUMN_REGISTRY.get(c).headerLabel());
        List<List<Object>> rows = new ArrayList<>();
        for (WorkStudyApplication app : apps) {
            List<Object> row = new ArrayList<>();
            for (String c : columns) row.add(COLUMN_REGISTRY.get(c).extractor().apply(app));
            rows.add(row);
        }
        if (apps.size() >= MAX_ROWS) {
            log.warn("export hit row limit {}; data truncated. title={}", MAX_ROWS, title);
        }
        return excelExportService.toXlsx(safeSheetName(title), summary, headers, rows);
    }

    private void attachPositionTitles(List<WorkStudyApplication> apps) {
        if (apps == null || apps.isEmpty()) return;
        Set<Long> ids = new HashSet<>();
        for (WorkStudyApplication a : apps) if (a.getPositionId() != null) ids.add(a.getPositionId());
        if (ids.isEmpty()) return;
        List<WorkStudyPosition> positions = positionMapper.selectBatchIds(ids);
        Map<Long, WorkStudyApplication.PositionSummary> byId = new HashMap<>();
        for (WorkStudyPosition p : positions) {
            byId.put(p.getId(), WorkStudyApplication.PositionSummary.fromPosition(p));
        }
        for (WorkStudyApplication a : apps) a.setPositionSummary(byId.get(a.getPositionId()));
    }

    private static String safeSheetName(String s) {
        if (s == null) return "Sheet1";
        // Excel sheet 名长度 31，禁用字符 / \ * ? [ ] :
        String cleaned = s.replaceAll("[\\\\/*?\\[\\]:]", "").trim();
        if (cleaned.isEmpty()) return "Sheet1";
        return cleaned.length() > 31 ? cleaned.substring(0, 31) : cleaned;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static OffsetDateTime parseDateAsStart(Object v) {
        try {
            return LocalDate.parse(v.toString()).atStartOfDay().atOffset(ZoneOffset.UTC);
        } catch (Exception e) { return null; }
    }

    private static OffsetDateTime parseDateAsEnd(Object v) {
        try {
            return LocalDate.parse(v.toString()).plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        } catch (Exception e) { return null; }
    }

    /** "2026-05" → [2026-05-01, 2026-06-01) */
    private static LocalDate[] parseMonth(Object v) {
        try {
            String s = v.toString();
            LocalDate first = LocalDate.parse(s + "-01");
            return new LocalDate[]{first, first.plusMonths(1)};
        } catch (Exception e) { return null; }
    }

    private record ColumnDef(String headerLabel, Function<WorkStudyApplication, Object> extractor) {}

    private static Map<String, ColumnDef> buildColumnRegistry() {
        Map<String, ColumnDef> m = new LinkedHashMap<>();
        m.put("id", new ColumnDef("申请ID", WorkStudyApplication::getId));
        m.put("student_name", new ColumnDef("学生姓名", WorkStudyApplication::getStudentName));
        m.put("student_id", new ColumnDef("学生ID", WorkStudyApplication::getStudentId));
        m.put("position_id", new ColumnDef("岗位ID", WorkStudyApplication::getPositionId));
        m.put("position_title", new ColumnDef("岗位", a -> a.getPositionSummary() != null ? a.getPositionSummary().getTitle() : null));
        m.put("financial_aid_level", new ColumnDef("资助等级", WorkStudyApplication::getFinancialAidLevel));
        m.put("intro", new ColumnDef("自荐", WorkStudyApplication::getIntro));
        m.put("status", new ColumnDef("状态", a -> labelOr(STATUS_LABELS, a.getStatus())));
        m.put("decision_note", new ColumnDef("处理意见", WorkStudyApplication::getDecisionNote));
        m.put("decided_at", new ColumnDef("处理时间", WorkStudyApplication::getDecidedAt));
        m.put("engagement_status", new ColumnDef("在岗状态", a -> labelOr(ENGAGEMENT_LABELS, a.getEngagementStatus())));
        m.put("engaged_at", new ColumnDef("到岗时间", WorkStudyApplication::getEngagedAt));
        m.put("offboarded_at", new ColumnDef("离岗时间", WorkStudyApplication::getOffboardedAt));
        m.put("offboard_reason", new ColumnDef("离岗原因", a -> labelOr(OFFBOARD_REASON_LABELS, a.getOffboardReason())));
        m.put("offboard_note", new ColumnDef("离岗备注", WorkStudyApplication::getOffboardNote));
        m.put("created_at", new ColumnDef("提交时间", WorkStudyApplication::getCreatedAt));
        return m;
    }

    private static String labelOr(Map<String, String> map, String code) {
        if (code == null) return null;
        return map.getOrDefault(code, code);
    }

    /** 列字典对外暴露（前端 AI Modal 可调用了解可选列） */
    public static Set<String> availableColumns() {
        return new LinkedHashSet<>(COLUMN_REGISTRY.keySet());
    }
}
