package com.xg.business.dataimport.service;

import com.xg.business.dataimport.mapper.DataImportWriteMapper;
import com.xg.business.dataimport.schema.TargetField;
import com.xg.business.dataimport.schema.TargetSchemas;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 执行前的纯校验：必填、文件内学号重复、与库内重复。不写库。
 * 输出格式（落 session.validation_report JSONB）：
 * <pre>
 * {
 *   pass: N, warn: N, error: N,
 *   errors:   [{row, col, message}],
 *   warnings: [{row, col, message, kind}],
 *   conflict_count: N,             // 学号已存在库里的行数（决定 Step 4 策略可选项）
 *   conflict_student_nos: [...]
 * }
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImportValidationService {

    private final DataImportWriteMapper writeMapper;

    public Map<String, Object> validate(String scenario,
                                        Map<String, Object> columnMapping,
                                        List<List<String>> rows) {
        List<TargetField> targets = TargetSchemas.forScenario(scenario);
        Map<String, Integer> targetToSource = buildTargetToSource(columnMapping);

        // 必填字段在映射里都对上了吗（如果没对上，整张表都没法导）
        List<Map<String, Object>> errors = new ArrayList<>();
        List<Map<String, Object>> warnings = new ArrayList<>();
        for (TargetField t : targets) {
            if (t.required() && !targetToSource.containsKey(t.key())) {
                errors.add(rowError(0, null, "必填字段「" + t.label() + "」未映射，无法导入"));
            }
        }

        int passCount = 0;
        Set<String> seenKeys = new HashSet<>();
        boolean isStudent = "student".equals(scenario);
        boolean isCounselor = "counselor".equals(scenario);
        String keyTargetCol = isStudent ? "student_no" : "username";
        String keyLabel = isStudent ? "学号" : "工号";
        Integer keyIdx = targetToSource.get(keyTargetCol);

        // 收集所有主键值，下面一次性查库
        List<String> keys = new ArrayList<>();
        for (List<String> row : rows) {
            String no = keyIdx == null ? "" : safeCell(row, keyIdx);
            if (!no.isEmpty()) keys.add(no);
        }
        Set<String> existingInDb = keys.isEmpty()
                ? Set.of()
                : new HashSet<>(isStudent
                        ? writeMapper.findExistingStudentNos(keys)
                        : writeMapper.findExistingUsernames(keys));

        // 逐行校验
        for (int r = 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            int rowNum = r + 1;
            boolean rowError = false;

            // 必填校验
            for (TargetField t : targets) {
                if (!t.required()) continue;
                Integer srcIdx = targetToSource.get(t.key());
                if (srcIdx == null) continue;       // 顶层已记录，跳过逐行
                String v = safeCell(row, srcIdx);
                if (v.isEmpty()) {
                    errors.add(rowError(rowNum, t.label(), t.label() + " 为空"));
                    rowError = true;
                }
            }

            if (rowError) continue;

            // 主键重复（文件内）
            if (keyIdx != null) {
                String no = safeCell(row, keyIdx);
                if (!no.isEmpty()) {
                    if (seenKeys.contains(no)) {
                        errors.add(rowError(rowNum, keyLabel, keyLabel + "「" + no + "」在文件内重复出现"));
                        continue;
                    }
                    seenKeys.add(no);

                    if (isCounselor) {
                        // 辅导员场景：用户必须先在系统里。不存在 → error;
                        // 存在 → 这是正常情况（要给他绑角色），不算 conflict。
                        if (!existingInDb.contains(no)) {
                            errors.add(rowError(rowNum, keyLabel,
                                    keyLabel + "「" + no + "」在系统里不存在,请先用「教师基础信息」场景导入"));
                            continue;
                        }
                    } else {
                        // 学生 / 教师场景：已存在库里 → conflict warning (Step 4 选策略)
                        if (existingInDb.contains(no)) {
                            warnings.add(rowWarn(rowNum, keyLabel,
                                    keyLabel + "「" + no + "」系统里已有，将按所选策略处理", "conflict"));
                        }
                    }
                }
            }

            passCount++;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pass", passCount);
        out.put("warn", warnings.size());
        out.put("error", errors.size());
        out.put("errors", errors);
        out.put("warnings", warnings);
        out.put("conflict_count",
                (int) warnings.stream().filter(w -> "conflict".equals(w.get("kind"))).count());
        return out;
    }

    // ---------- helpers ----------

    private static Map<String, Integer> buildTargetToSource(Map<String, Object> columnMapping) {
        Map<String, Integer> out = new HashMap<>();
        if (columnMapping == null) return out;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mappings = (List<Map<String, Object>>) columnMapping.get("mappings");
        if (mappings == null) return out;
        for (Map<String, Object> m : mappings) {
            Object t = m.get("target");
            if (t == null) continue;
            Object idx = m.get("source_index");
            if (idx instanceof Number n) out.put((String) t, n.intValue());
        }
        return out;
    }

    private static String safeCell(List<String> row, Integer idx) {
        if (idx == null || row == null || idx < 0 || idx >= row.size()) return "";
        String v = row.get(idx);
        return v == null ? "" : v.trim();
    }

    private static Map<String, Object> rowError(int row, String col, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("row", row);
        if (col != null) m.put("col", col);
        m.put("message", message);
        return m;
    }

    private static Map<String, Object> rowWarn(int row, String col, String message, String kind) {
        Map<String, Object> m = rowError(row, col, message);
        m.put("kind", kind);
        return m;
    }
}
