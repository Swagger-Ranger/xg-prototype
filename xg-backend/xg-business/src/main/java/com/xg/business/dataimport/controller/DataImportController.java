package com.xg.business.dataimport.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.business.dataimport.dto.SessionView;
import com.xg.business.dataimport.service.DataImportService;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Set;

/**
 * 数据导入是高权限操作 (写 sys_user / sys_user_role / org_unit),
 * 类级统一鉴权 system:user:manage (school_admin / super_admin 已有),
 * 避免任一端点漏掉。复用 user:manage 而非新增 import:manage:
 * 导入本质就是批量创建用户,语义匹配。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/data-import")
@RequiredArgsConstructor
@SaCheckPermission("system:user:manage")
public class DataImportController {

    private static final Set<String> SCENARIOS = Set.of("student", "teacher", "counselor");

    private final DataImportService dataImportService;

    /**
     * Step 1 提交：创建会话 + 立即解析文件，返回带 headers/samples 的视图。
     * 走 multipart/form-data：scenario / intentText / file。
     */
    @PostMapping("/sessions")
    public R<SessionView> create(
            @RequestParam("scenario") String scenario,
            @RequestParam(value = "intentText", required = false) String intentText,
            @RequestParam("file") MultipartFile file) {
        if (!SCENARIOS.contains(scenario)) {
            throw new BizException("IMPORT_SCENARIO_INVALID", "未知场景：" + scenario);
        }
        return R.ok(dataImportService.createAndParse(scenario, intentText, CurrentUser.id(), file));
    }

    @GetMapping("/sessions/{id}")
    public R<SessionView> view(@PathVariable Long id) {
        return R.ok(dataImportService.view(id));
    }

    /**
     * Step 2 入场：跑列映射建议（启发式 + AI 兜底）。可选 mapping_intent 是用户在 Step 2 输入框
     * 的自然语言补充（"备注里含'困难'两字的 aid_level 填 difficult" 这类）。
     */
    @PostMapping("/sessions/{id}/auto-map")
    public R<SessionView> autoMap(@PathVariable Long id,
                                  @RequestBody(required = false) AutoMapRequest body) {
        String intent = body == null ? null : body.getMappingIntent();
        return R.ok(dataImportService.autoMap(id, intent));
    }

    /**
     * Step 2 手改一列的映射。target_key 空字符串 = 不导入这列。
     */
    @PatchMapping("/sessions/{id}/mapping")
    public R<SessionView> overrideMapping(@PathVariable Long id,
                                          @RequestBody OverrideMappingRequest body) {
        return R.ok(dataImportService.overrideMapping(id, body.getSourceIndex(), body.getTargetKey()));
    }

    /**
     * Step 3 入场（学生场景）：推断组织树预览。
     */
    @PostMapping("/sessions/{id}/org-preview")
    public R<SessionView> previewOrg(@PathVariable Long id) {
        return R.ok(dataImportService.previewOrg(id));
    }

    /**
     * Step 4 入场：跑校验报告。
     */
    @PostMapping("/sessions/{id}/validate")
    public R<SessionView> validate(@PathVariable Long id) {
        return R.ok(dataImportService.validate(id));
    }

    /**
     * Step 5：执行导入。body: { strategy: "update" | "skip" }
     */
    @PostMapping("/sessions/{id}/execute")
    public R<SessionView> execute(@PathVariable Long id,
                                  @RequestBody(required = false) ExecuteRequest body) {
        String strategy = body == null ? null : body.getStrategy();
        return R.ok(dataImportService.execute(id, CurrentUser.id(), strategy));
    }

    @lombok.Getter @lombok.Setter
    public static class ExecuteRequest {
        private String strategy;
    }

    @lombok.Getter @lombok.Setter
    public static class AutoMapRequest {
        private String mappingIntent;
    }

    @lombok.Getter @lombok.Setter
    public static class OverrideMappingRequest {
        private int sourceIndex;
        private String targetKey;
    }
}
