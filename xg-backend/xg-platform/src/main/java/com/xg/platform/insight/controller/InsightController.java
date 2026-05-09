package com.xg.platform.insight.controller;

import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.insight.dto.InsightResponse;
import com.xg.platform.insight.model.WorkspaceInsight;
import com.xg.platform.insight.service.InsightFeedbackService;
import com.xg.platform.insight.service.InsightService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequiredArgsConstructor
public class InsightController {

    private static final Duration COOLDOWN = Duration.ofMinutes(10);

    private final InsightService insightService;
    private final InsightFeedbackService feedbackService;
    private final StringRedisTemplate redis;

    @GetMapping("/api/v1/insights")
    public R<InsightResponse> latest(@RequestParam String role,
                                     @RequestParam(required = false) Long classId) {
        Long uid = CurrentUser.id();
        String scopeKey = resolveScopeKey(role, uid, classId);
        WorkspaceInsight row = insightService.getLatest(role, scopeKey);
        return R.ok(toResponse(row, uid));
    }

    @PostMapping("/api/v1/insights/refresh")
    public R<InsightResponse> refresh(@RequestParam String role,
                                      @RequestParam(required = false) Long classId) {
        Long uid = CurrentUser.id();
        String scopeKey = resolveScopeKey(role, uid, classId);
        String cooldownKey = String.format("insight:cooldown:%s:%s:%s",
                TenantContext.getTenantId(), role, scopeKey);
        Boolean acquired = redis.opsForValue().setIfAbsent(cooldownKey, "1", COOLDOWN);
        if (Boolean.FALSE.equals(acquired)) {
            Long ttl = redis.getExpire(cooldownKey);
            throw new BizException("INSIGHT_COOLDOWN",
                    "刚刷新过，请 " + (ttl == null ? COOLDOWN.toSeconds() : ttl) + " 秒后再试");
        }
        WorkspaceInsight row = insightService.refresh(role, scopeKey, classId, String.valueOf(uid));
        return R.ok(toResponse(row, uid));
    }

    @PostMapping("/api/v1/insights/{insightId}/feedback")
    public R<Void> submitFeedback(@PathVariable Long insightId,
                                  @RequestParam Integer itemIndex,
                                  @RequestParam String action) {
        feedbackService.record(insightId, itemIndex, CurrentUser.id(), action);
        return R.ok();
    }

    private String resolveScopeKey(String role, Long userId, Long classId) {
        if ("counselor".equals(role)) {
            String uid = userId == null ? "0" : String.valueOf(userId);
            return classId == null ? uid : uid + ":class:" + classId;
        }
        return "global";
    }

    private InsightResponse toResponse(WorkspaceInsight row, Long userId) {
        if (row == null) return null;
        InsightResponse resp = new InsightResponse();
        BeanUtils.copyProperties(row, resp);
        resp.setFeedbackCounts(feedbackService.countsByItem(row.getId()));
        resp.setUserVotes(feedbackService.userVotes(row.getId(), userId));
        return resp;
    }
}
