package com.xg.platform.insight.controller;

import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.insight.metrics.WorkspaceMetricsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Live metrics endpoint — bypasses the LLM so frontends (Dean / Counselor workspaces)
 * can show fresh KPIs on first visit without waiting for the 02:30 insight cron or
 * a manual refresh.
 */
@RestController
@RequiredArgsConstructor
public class WorkspaceMetricsController {

    private final WorkspaceMetricsService metricsService;

    @GetMapping("/api/v1/workspace/metrics")
    public R<Map<String, Object>> metrics(@RequestParam String role,
                                          @RequestHeader(value = "X-User-Id", required = false) String userId) {
        if ("dean".equals(role)) {
            return R.ok(metricsService.collectForDean());
        }
        if ("counselor".equals(role)) {
            if (userId == null || userId.isBlank()) {
                throw new BizException("ROLE_USER_REQUIRED", "counselor 角色需要 X-User-Id header");
            }
            return R.ok(metricsService.collectForCounselor(Long.parseLong(userId)));
        }
        throw new BizException("UNSUPPORTED_ROLE", "仅支持 dean / counselor");
    }
}
