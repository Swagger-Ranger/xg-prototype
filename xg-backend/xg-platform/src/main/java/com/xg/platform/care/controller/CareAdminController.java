package com.xg.platform.care.controller;

import com.xg.common.base.R;
import com.xg.platform.care.dto.CareDrillRequest;
import com.xg.platform.care.service.CareAdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 院系/学校管理视图端点（PRD §15.2）。范围/角色一律服务端从 Sa-Token 解析，
 * <b>不通过前端传 scope 放权</b>；非管理角色由 {@code CareAdminService} 抛
 * CARE_ADMIN_FORBIDDEN。
 */
@RestController
@RequiredArgsConstructor
public class CareAdminController {

    private final CareAdminService careAdminService;

    @GetMapping("/api/v1/care/admin/summary")
    public R<Map<String, Object>> summary() {
        return R.ok(careAdminService.summary());
    }

    @GetMapping("/api/v1/care/admin/overdue")
    public R<Map<String, Object>> overdue(@RequestParam(defaultValue = "1") int page,
                                          @RequestParam(defaultValue = "20") int size) {
        return R.ok(careAdminService.overdue(page, size));
    }

    @GetMapping("/api/v1/care/admin/trends")
    public R<Map<String, Object>> trends(@RequestParam(required = false) Integer days) {
        return R.ok(careAdminService.trends(days));
    }

    @PostMapping("/api/v1/care/admin/tasks/{taskId}/urge")
    public R<Void> urge(@PathVariable Long taskId) {
        careAdminService.urge(taskId);
        return R.ok();
    }

    @PostMapping("/api/v1/care/admin/drill-down/{studentId}")
    public R<Map<String, Object>> drillDown(@PathVariable Long studentId,
                                            @Valid @RequestBody CareDrillRequest req) {
        return R.ok(careAdminService.drillDown(studentId, req));
    }

    @GetMapping("/api/v1/care/admin/drill-down/log")
    public R<Map<String, Object>> drillLog(@RequestParam(defaultValue = "1") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return R.ok(careAdminService.drillLog(page, size));
    }
}
