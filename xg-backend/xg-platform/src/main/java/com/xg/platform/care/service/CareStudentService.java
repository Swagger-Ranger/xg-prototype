package com.xg.platform.care.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.rule.CareRuleCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 学生侧只读关怀摘要（PRD §13.3）。合规红线：
 * <ul>
 *   <li>student_id 强制取 {@link CurrentUser#id()}，无 studentId 入参 —— 越权查他人在结构上不可能</li>
 *   <li>只数"当前未关闭"任务，按 §13.3 四桶聚合；不返回历史总数 / 闭环数 / 规则名 /
 *       严重度 / AI 解释 / 辅导员 / 证据</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class CareStudentService {

    private static final List<String> OPEN_STATUSES =
            List.of("pending", "accepted", "in_progress", "overdue");

    private final CareTaskMapper careTaskMapper;

    /** 当前学生未关闭关怀的类型摘要。全部关闭返回兜底文案。 */
    public Map<String, Object> activeSummary() {
        Long studentId = CurrentUser.id();

        List<CareTask> open = careTaskMapper.selectList(new LambdaQueryWrapper<CareTask>()
                .eq(CareTask::getStudentId, studentId)
                .in(CareTask::getStatus, OPEN_STATUSES));

        // 规则内部分类 → 学生侧白名单桶，按桶计数（顺序稳定，便于前端固定排版）
        Map<String, Integer> byBucket = new LinkedHashMap<>();
        for (CareTask t : open) {
            String ruleCategory = CareRuleCatalog.findById(t.getRuleId())
                    .map(s -> s.category()).orElse(null);
            String bucket = CareStudentCategory.label(ruleCategory);
            byBucket.merge(bucket, 1, Integer::sum);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        if (byBucket.isEmpty()) {
            out.put("items", List.of());
            out.put("message", CareStudentCategory.EMPTY_MESSAGE);
            return out;
        }

        List<Map<String, Object>> items = new java.util.ArrayList<>(byBucket.size());
        for (Map.Entry<String, Integer> e : byBucket.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("category", e.getKey());
            item.put("count", e.getValue());
            item.put("message", CareStudentCategory.message(e.getKey(), e.getValue()));
            items.add(item);
        }
        out.put("items", items);
        return out;
    }
}
