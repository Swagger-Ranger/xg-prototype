package com.xg.business.dataimport.service;

import com.xg.business.dataimport.schema.TargetField;
import com.xg.business.dataimport.schema.TargetSchemas;
import com.xg.platform.insight.client.AiSidecarClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 列映射核心：启发式 (alias + 模糊匹配) 先跑出基线，AI sidecar 在线时叠加（覆盖低置信度项）。
 * 保留 sidecar 不可用降级语义 —— 学校 Excel 列名八成有标准叫法，启发式自身就能覆盖大头。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ColumnMappingService {

    private static final double THRESHOLD_KEEP = 0.5;
    private static final double THRESHOLD_HIGH = 0.85;

    private final AiSidecarClient aiSidecarClient;

    /**
     * 输出结构（同时写入 session.column_mapping JSONB）：
     * <pre>
     * {
     *   "targets": [{key,label,required,category}, ...],
     *   "mappings": [{source_col, source_index, target, confidence, source}, ...]
     * }
     * source = "ai" | "heuristic" | "user"
     * target = null 表示未映射（前端显示"不导入这列"）
     * </pre>
     */
    public Map<String, Object> suggest(String scenario, List<String> headers, List<List<String>> samples,
                                       String intentText, String tenantId) {
        List<TargetField> targets = TargetSchemas.forScenario(scenario);

        List<Map<String, Object>> mappings = new ArrayList<>(headers.size());
        for (int i = 0; i < headers.size(); i++) {
            String header = headers.get(i);
            HeuristicMatch m = bestHeuristic(header, targets);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("source_col", header);
            row.put("source_index", i);
            row.put("target", m.confidence >= THRESHOLD_KEEP ? m.target : null);
            row.put("confidence", m.confidence);
            row.put("source", "heuristic");
            mappings.add(row);
        }

        tryEnhanceWithAi(scenario, headers, samples, intentText, targets, mappings, tenantId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("targets", targetsForFrontend(targets));
        out.put("mappings", mappings);
        return out;
    }

    /**
     * 用户手改一列的映射。仅做形状校验 —— 业务侧后续 validate 时再检查必填字段全没。
     */
    public Map<String, Object> override(Map<String, Object> current, int sourceIndex, String targetKey) {
        if (current == null) {
            throw new IllegalStateException("session has no column_mapping to override");
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mappings = (List<Map<String, Object>>) current.get("mappings");
        if (mappings == null || sourceIndex < 0 || sourceIndex >= mappings.size()) {
            throw new IllegalArgumentException("source_index out of range");
        }
        Map<String, Object> row = mappings.get(sourceIndex);
        row.put("target", targetKey == null || targetKey.isBlank() ? null : targetKey);
        row.put("confidence", 1.0);
        row.put("source", "user");
        return current;
    }

    // ---------- heuristic ----------

    private record HeuristicMatch(String target, double confidence) {}

    private HeuristicMatch bestHeuristic(String header, List<TargetField> targets) {
        String h = normalize(header);
        if (h.isEmpty()) return new HeuristicMatch(null, 0.0);

        String best = null;
        double bestScore = 0.0;
        for (TargetField t : targets) {
            double score = scoreAgainst(h, t);
            if (score > bestScore) {
                best = t.key();
                bestScore = score;
            }
        }
        return new HeuristicMatch(best, bestScore);
    }

    private double scoreAgainst(String normalizedHeader, TargetField field) {
        double best = 0.0;
        for (String alias : field.aliases()) {
            String a = normalize(alias);
            if (a.isEmpty()) continue;
            if (a.equals(normalizedHeader)) return 1.0;
            if (normalizedHeader.contains(a) || a.contains(normalizedHeader)) {
                best = Math.max(best, 0.85);
            } else {
                double j = jaccardChar(a, normalizedHeader);
                if (j >= 0.5) best = Math.max(best, j * 0.8);
            }
        }
        return best;
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return s.trim().toLowerCase()
                .replaceAll("\\s+", "")
                .replace("　", "")     // 全角空格
                .replace("（", "(").replace("）", ")")
                .replace("：", "");
    }

    /** 字符级 Jaccard，处理"联系手机" vs "手机号"这种部分重合。 */
    private static double jaccardChar(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return 0.0;
        java.util.Set<Character> sa = new java.util.HashSet<>();
        java.util.Set<Character> sb = new java.util.HashSet<>();
        for (char c : a.toCharArray()) sa.add(c);
        for (char c : b.toCharArray()) sb.add(c);
        java.util.Set<Character> inter = new java.util.HashSet<>(sa);
        inter.retainAll(sb);
        java.util.Set<Character> union = new java.util.HashSet<>(sa);
        union.addAll(sb);
        return union.isEmpty() ? 0.0 : (double) inter.size() / union.size();
    }

    // ---------- AI overlay ----------

    private void tryEnhanceWithAi(String scenario, List<String> headers, List<List<String>> samples,
                                  String intentText, List<TargetField> targets,
                                  List<Map<String, Object>> mappings, String tenantId) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("scenario", scenario);
        context.put("headers", headers);
        context.put("samples", samples);
        context.put("intent_text", intentText == null ? "" : intentText);
        context.put("targets", targetsForFrontend(targets));

        AiSidecarClient.AgentResult res =
                aiSidecarClient.invokeAgent("data_import_column_mapper", context, Map.of(), tenantId);
        if (!res.ok()) {
            log.debug("data_import_column_mapper unavailable, falling back to heuristic only: {}", res.errorMessage());
            return;
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> aiMappings = (List<Map<String, Object>>) res.output().get("mappings");
        if (aiMappings == null || aiMappings.isEmpty()) return;

        Map<Integer, Map<String, Object>> byIdx = new LinkedHashMap<>();
        for (Map<String, Object> m : aiMappings) {
            Object idx = m.get("source_index");
            if (idx instanceof Number n) byIdx.put(n.intValue(), m);
        }

        for (Map<String, Object> existing : mappings) {
            double prevConf = ((Number) existing.getOrDefault("confidence", 0.0)).doubleValue();
            if (prevConf >= THRESHOLD_HIGH) continue;     // 启发式已经很自信，不让 AI 覆盖
            Map<String, Object> ai = byIdx.get(((Number) existing.get("source_index")).intValue());
            if (ai == null) continue;
            Object aiTarget = ai.get("target");
            double aiConf = ((Number) ai.getOrDefault("confidence", 0.0)).doubleValue();
            if (aiConf > prevConf) {
                existing.put("target", aiTarget);
                existing.put("confidence", aiConf);
                existing.put("source", "ai");
            }
        }
    }

    private static List<Map<String, Object>> targetsForFrontend(List<TargetField> targets) {
        List<Map<String, Object>> out = new ArrayList<>(targets.size());
        for (TargetField t : targets) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", t.key());
            m.put("label", t.label());
            m.put("required", t.required());
            m.put("category", t.category());
            out.add(m);
        }
        return out;
    }
}
