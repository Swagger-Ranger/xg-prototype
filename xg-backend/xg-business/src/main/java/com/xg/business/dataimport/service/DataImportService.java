package com.xg.business.dataimport.service;

import com.xg.business.dataimport.dto.SessionView;
import com.xg.business.dataimport.mapper.DataImportSessionMapper;
import com.xg.business.dataimport.model.DataImportSession;
import com.xg.business.dataimport.parse.ExcelGridParser;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataImportService {

    private static final int SAMPLE_SIZE = 5;

    private final DataImportSessionMapper sessionMapper;
    private final ExcelGridParser parser;
    private final ColumnMappingService columnMappingService;
    private final OrgTreeInferenceService orgTreeService;
    private final ImportValidationService validationService;
    private final StudentImportExecutor studentExecutor;
    private final TeacherImportExecutor teacherExecutor;
    private final CounselorImportExecutor counselorExecutor;

    @Transactional
    public SessionView createAndParse(String scenario, String intentText, Long importerId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException("IMPORT_FILE_REQUIRED", "请上传文件");
        }
        ExcelGridParser.Grid grid = parser.parse(file);
        if (grid.getRows().isEmpty()) {
            throw new BizException("IMPORT_FILE_EMPTY", "文件没有数据行");
        }

        DataImportSession session = new DataImportSession();
        session.setImporterId(importerId);
        session.setScenario(scenario);
        session.setStatus("parsed");
        session.setFileName(file.getOriginalFilename());
        session.setTotalRows(grid.getRows().size());
        session.setIntentText(intentText);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("headers", grid.getHeaders());
        payload.put("samples", grid.getRows().subList(0, Math.min(SAMPLE_SIZE, grid.getRows().size())));
        payload.put("rows", grid.getRows());
        session.setParsedPayload(payload);

        sessionMapper.insert(session);
        return toView(session);
    }

    public SessionView view(Long id) {
        DataImportSession session = require(id);
        return toView(session);
    }

    /**
     * Step 2 触发：跑列映射（启发式 + AI 兜底），落库 + 推进状态。
     */
    @Transactional
    public SessionView autoMap(Long id, String mappingIntent) {
        DataImportSession session = require(id);
        Map<String, Object> payload = session.getParsedPayload();
        if (payload == null) {
            throw new BizException("IMPORT_NOT_PARSED", "请先上传文件");
        }
        @SuppressWarnings("unchecked")
        List<String> headers = (List<String>) payload.get("headers");
        @SuppressWarnings("unchecked")
        List<List<String>> samples = (List<List<String>>) payload.get("samples");

        if (mappingIntent != null) session.setMappingIntent(mappingIntent);

        String intentText = (session.getIntentText() == null ? "" : session.getIntentText()) +
                (mappingIntent == null || mappingIntent.isBlank() ? "" : "\n" + mappingIntent);

        Map<String, Object> mapping = columnMappingService.suggest(
                session.getScenario(), headers, samples,
                intentText, TenantContext.getRequiredTenantId());

        session.setColumnMapping(mapping);
        session.setStatus("mapped");
        sessionMapper.updateById(session);
        return toView(session);
    }

    /**
     * Step 3 触发（学生场景）：从 column_mapping + 全表 rows 推断组织树预览。
     * 教师 / 辅导员场景不走这步，直接由前端跳过。
     */
    @Transactional
    public SessionView previewOrg(Long id) {
        DataImportSession session = require(id);
        if (!"student".equals(session.getScenario())) {
            throw new BizException("IMPORT_STEP_NOT_APPLICABLE", "当前场景不需要组织树预览");
        }
        if (session.getColumnMapping() == null) {
            throw new BizException("IMPORT_MAPPING_REQUIRED", "请先完成列映射");
        }
        @SuppressWarnings("unchecked")
        List<List<String>> rows = (List<List<String>>) session.getParsedPayload().get("rows");
        Map<String, Object> preview = orgTreeService.infer(session.getColumnMapping(), rows);
        session.setOrgPreview(preview);
        session.setStatus("org_previewed");
        sessionMapper.updateById(session);
        return toView(session);
    }

    /**
     * Step 4 入场：跑校验报告（必填 / 文件内学号重复 / 与库内冲突）。
     */
    @Transactional
    public SessionView validate(Long id) {
        DataImportSession session = require(id);
        if (session.getColumnMapping() == null) {
            throw new BizException("IMPORT_MAPPING_REQUIRED", "请先完成列映射");
        }
        @SuppressWarnings("unchecked")
        List<List<String>> rows = (List<List<String>>) session.getParsedPayload().get("rows");
        Map<String, Object> report = validationService.validate(session.getScenario(), session.getColumnMapping(), rows);
        session.setValidationReport(report);
        session.setStatus("validated");
        sessionMapper.updateById(session);
        return toView(session);
    }

    /**
     * Step 5：执行导入。当前仅支持 scenario=student；teacher/counselor 后续补。
     * strategy: "update" (默认) | "skip"
     */
    @Transactional
    public SessionView execute(Long id, Long operatorId, String strategy) {
        DataImportSession session = require(id);
        if (session.getValidationReport() == null) {
            throw new BizException("IMPORT_VALIDATE_REQUIRED", "请先完成校验");
        }
        int errorCount = ((Number) session.getValidationReport().getOrDefault("error", 0)).intValue();
        if (errorCount > 0) {
            throw new BizException("IMPORT_HAS_ERRORS", "校验发现 " + errorCount + " 处错误，请先修正");
        }
        String scenario = session.getScenario();

        session.setStrategy(Map.of("on_conflict", "skip".equalsIgnoreCase(strategy) ? "skip" : "update"));
        session.setStatus("executing");
        sessionMapper.updateById(session);

        @SuppressWarnings("unchecked")
        List<List<String>> rows = (List<List<String>>) session.getParsedPayload().get("rows");

        Map<String, Object> summary;
        try {
            switch (scenario) {
                case "student" -> summary = studentExecutor.execute(
                        TenantContext.getRequiredTenantId(),
                        operatorId,
                        session.getColumnMapping(),
                        session.getOrgPreview(),
                        rows,
                        strategy);
                case "teacher" -> summary = teacherExecutor.execute(
                        TenantContext.getRequiredTenantId(),
                        operatorId,
                        session.getColumnMapping(),
                        rows,
                        strategy);
                case "counselor" -> summary = counselorExecutor.execute(
                        TenantContext.getRequiredTenantId(),
                        operatorId,
                        session.getColumnMapping(),
                        rows,
                        strategy);
                default -> throw new BizException("IMPORT_NOT_IMPLEMENTED", "未知场景：" + scenario);
            }
            session.setResultSummary(summary);
            session.setStatus("executed");
        } catch (RuntimeException e) {
            log.error("import execute failed sessionId={}", id, e);
            session.setStatus("failed");
            session.setErrorMessage(e.getMessage() == null ? "执行失败" : e.getMessage());
            sessionMapper.updateById(session);
            throw e;
        }
        sessionMapper.updateById(session);
        return toView(session);
    }

    /**
     * Step 2 用户手改一列的映射。targetKey 传 null/"" = 不导入这列。
     */
    @Transactional
    public SessionView overrideMapping(Long id, int sourceIndex, String targetKey) {
        DataImportSession session = require(id);
        Map<String, Object> mapping = columnMappingService.override(session.getColumnMapping(), sourceIndex, targetKey);
        session.setColumnMapping(mapping);
        sessionMapper.updateById(session);
        return toView(session);
    }

    private DataImportSession require(Long id) {
        DataImportSession session = sessionMapper.selectById(id);
        if (session == null) {
            throw new BizException("IMPORT_SESSION_NOT_FOUND", "导入会话不存在");
        }
        return session;
    }

    private SessionView toView(DataImportSession s) {
        SessionView.SessionViewBuilder b = SessionView.builder()
                .id(String.valueOf(s.getId()))
                .scenario(s.getScenario())
                .status(s.getStatus())
                .fileName(s.getFileName())
                .totalRows(s.getTotalRows())
                .intentText(s.getIntentText())
                .mappingIntent(s.getMappingIntent())
                .errorMessage(s.getErrorMessage())
                .columnMapping(s.getColumnMapping())
                .orgPreview(s.getOrgPreview())
                .validationReport(s.getValidationReport())
                .strategy(s.getStrategy())
                .resultSummary(s.getResultSummary());

        Map<String, Object> payload = s.getParsedPayload();
        if (payload != null) {
            @SuppressWarnings("unchecked")
            List<String> headers = (List<String>) payload.get("headers");
            @SuppressWarnings("unchecked")
            List<List<String>> samples = (List<List<String>>) payload.get("samples");
            b.headers(headers == null ? new ArrayList<>() : headers);
            b.samples(samples == null ? new ArrayList<>() : samples);
        }
        return b.build();
    }
}
