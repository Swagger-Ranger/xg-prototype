package com.xg.platform.care.controller;

import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.care.dto.CareTaskQueryRequest;
import com.xg.platform.care.dto.RejectCareTaskRequest;
import com.xg.platform.care.dto.RescheduleCareTaskRequest;
import com.xg.platform.care.dto.ResolveCareTaskRequest;
import com.xg.platform.care.dto.TransferCareTaskRequest;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.service.CareScanService;
import com.xg.platform.care.service.CareTaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 主动关怀工作台 HTTP 端点（W1 §9.2 / PRD §15.1）。
 *
 * <p>URL 约定：{@code /api/v1/care/tasks/...}，沿用项目 /api/v1/* 前缀。
 * <p>未鉴权失败 / 状态机非法 / 资源不存在等错误：抛 BizException，由全局异常处理器转 R.fail()。
 */
@RestController
@RequiredArgsConstructor
public class CareTaskController {

    private final CareTaskService careTaskService;
    private final CareScanService careScanService;

    // ─────────────────── 查询 ───────────────────

    @GetMapping("/api/v1/care/tasks")
    public R<PageResult<CareTask>> list(@ModelAttribute CareTaskQueryRequest query) {
        return R.ok(careTaskService.list(query));
    }

    @GetMapping("/api/v1/care/tasks/{id}")
    public R<CareTask> detail(@PathVariable Long id) {
        return R.ok(careTaskService.detail(id));
    }

    // ─────────────────── 动作 ───────────────────

    @PostMapping("/api/v1/care/tasks/{id}/accept")
    public R<Void> accept(@PathVariable Long id) {
        careTaskService.accept(id);
        return R.ok();
    }

    @PostMapping("/api/v1/care/tasks/{id}/resolve")
    public R<Void> resolve(@PathVariable Long id,
                           @RequestBody(required = false) ResolveCareTaskRequest req) {
        careTaskService.resolve(id, req);
        return R.ok();
    }

    @PostMapping("/api/v1/care/tasks/{id}/reject")
    public R<Void> reject(@PathVariable Long id,
                          @Valid @RequestBody RejectCareTaskRequest req) {
        careTaskService.reject(id, req);
        return R.ok();
    }

    @PostMapping("/api/v1/care/tasks/{id}/reschedule")
    public R<Void> reschedule(@PathVariable Long id,
                              @Valid @RequestBody RescheduleCareTaskRequest req) {
        careTaskService.reschedule(id, req);
        return R.ok();
    }

    @PostMapping("/api/v1/care/tasks/{id}/transfer")
    public R<Void> transfer(@PathVariable Long id,
                            @Valid @RequestBody TransferCareTaskRequest req) {
        careTaskService.transfer(id, req);
        return R.ok();
    }

    // ─────────────────── AI brief（W2.2 最小集，实际生成走 W2.3）───────────────────

    @GetMapping("/api/v1/care/tasks/{id}/brief")
    public R<Map<String, Object>> brief(@PathVariable Long id) {
        return R.ok(careTaskService.getCurrentBrief(id));
    }

    @PostMapping("/api/v1/care/tasks/{id}/brief/refresh")
    public R<Void> refreshBrief(@PathVariable Long id) {
        careTaskService.requestBriefRefresh(id, "manual_refresh");
        return R.ok();
    }

    // ─────────────────── 规则扫描手动触发（UAT / 运维用，对齐旧 alert /scan）───────────────────

    @PostMapping("/api/v1/care/scan")
    public R<Map<String, Object>> triggerScan() {
        int created = careScanService.scanCurrentTenant();
        return R.ok(Map.of("created", created));
    }
}
