package com.xg.platform.insight.service;

import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.insight.mapper.InsightFeedbackMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class InsightFeedbackService {

    private final InsightFeedbackMapper feedbackMapper;

    public void record(Long insightId, Integer itemIndex, Long userId, String action) {
        if (!"up".equals(action) && !"down".equals(action)) {
            throw new BizException("INVALID_ACTION", "action 必须为 up 或 down");
        }
        if (itemIndex == null || itemIndex < 0) {
            throw new BizException("INVALID_INDEX", "itemIndex 非法");
        }
        feedbackMapper.upsert(TenantContext.getTenantId(), insightId, itemIndex, userId, action);
    }

    /** {itemIndex -> {up:N, down:N}} */
    public Map<Integer, Map<String, Long>> countsByItem(Long insightId) {
        Map<Integer, Map<String, Long>> out = new HashMap<>();
        for (InsightFeedbackMapper.FeedbackCount c : feedbackMapper.countByInsight(insightId)) {
            Map<String, Long> m = new HashMap<>();
            m.put("up", c.upCount == null ? 0 : c.upCount);
            m.put("down", c.downCount == null ? 0 : c.downCount);
            out.put(c.itemIndex, m);
        }
        return out;
    }

    /** {itemIndex -> "up"|"down"} — only the items this user has voted on. */
    public Map<Integer, String> userVotes(Long insightId, Long userId) {
        if (userId == null) return Map.of();
        Map<Integer, String> out = new HashMap<>();
        List<InsightFeedbackMapper.UserVote> votes = feedbackMapper.listUserVotes(insightId, userId);
        for (InsightFeedbackMapper.UserVote v : votes) {
            out.put(v.itemIndex, v.action);
        }
        return out;
    }
}
