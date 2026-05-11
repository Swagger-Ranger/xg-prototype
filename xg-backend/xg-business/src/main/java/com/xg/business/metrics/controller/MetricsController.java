package com.xg.business.metrics.controller;

import com.xg.business.metrics.dto.MetricQueryRequest;
import com.xg.business.metrics.dto.MetricQueryResponse;
import com.xg.business.metrics.dto.MetricScope;
import com.xg.business.metrics.service.MetricsScopeResolver;
import com.xg.business.metrics.service.MetricsService;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * NL 问数(管理者视角)endpoint。
 *
 * <p>scope 在 service 层强注入,前端/Sidecar 任何 college_id 传入都会被覆盖。
 * 403 只对非管理类角色 (student/counselor/...) 命中,正确的 401 / 鉴权失败 走 Sa-Token。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/metrics")
public class MetricsController {

    private final MetricsService metricsService;
    private final MetricsScopeResolver scopeResolver;

    @PostMapping("/query")
    public R<MetricQueryResponse> query(@Valid @RequestBody MetricQueryRequest req) {
        MetricScope scope = scopeResolver.resolveCurrent();
        if (scope.getKind() == MetricScope.Kind.DENIED) {
            throw new BizException("METRICS_DENIED",
                    "你的角色没有问数权限(仅 院长 / 学工部部长 / 校管理员 可用)");
        }
        return R.ok(metricsService.query(req, scope));
    }
}
