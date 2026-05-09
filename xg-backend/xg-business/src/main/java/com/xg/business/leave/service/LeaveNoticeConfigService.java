package com.xg.business.leave.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.leave.dto.LeaveNoticeConfig;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 「请假须知」配置读写。沿用 LeaveImpactService 的存储约定 ——
 * 写入 public.tenant.config (jsonb) 的 leaveNoticeConfig 键。
 *
 * 缺失的字段统一走 {@link Defaults}，所以前端拿到的永远是完整结构。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveNoticeConfigService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /** 内置默认文案 —— 老师可在配置页改写,改写后只覆盖被改的字段。 */
    public static final class Defaults {
        public static final boolean NOTICE_ENABLED = true;
        public static final boolean COMMITMENT_ENABLED = true;
        public static final int COMMITMENT_COUNTDOWN_SEC = 3;

        public static final String NOTICE_TEXT = """
                请假流程与注意事项

                1. 请如实填写假别、起止时间、原因及附件,虚假请假按校纪处理；
                2. 请假提交后将按假别和时长自动指派审批人,请关注小程序通知；
                3. 请假经审批通过方可离校;未审批通过擅自离校按旷课处理；
                4. 离校期间须保持通讯畅通,行程发生变更及时报告辅导员/班主任；
                5. 请假到期请按时返校并主动办理销假;逾期未销视为旷课。

                如有疑问请联系辅导员/班主任。""";

        public static final String COMMITMENT_TEXT = """
                请假安全承诺书

                为保障请假离校期间本人的人身和财产安全,本人郑重承诺:

                一、所填请假事由真实有效,无虚假、隐瞒或代请假情形;
                二、离校期间自觉遵守国家法律法规和学校校纪校规,不参与任何违法违规活动;
                三、注意人身和财产安全,特别防范交通、消防、饮食、用电、防溺水、防诈骗等风险,远离危险场所;
                四、保持通讯 24 小时畅通,主动接听辅导员、班主任来电,按时回复消息;
                五、行程发生重大变更(目的地、同行人、返校时间等)第一时间报告辅导员/班主任;
                六、按时返校并主动办理销假手续;因突发情况无法按时返校的提前申请续假;
                七、自愿承担本次请假离校期间发生的一切意外后果,相应安全责任由本人及监护人共同承担。

                我已认真阅读上述全部内容,自愿作出以上承诺。""";

        private Defaults() {}
    }

    public LeaveNoticeConfig get() {
        LeaveNoticeConfig cfg = readRaw();
        return withDefaults(cfg);
    }

    @Transactional
    public LeaveNoticeConfig update(LeaveNoticeConfig req) {
        if (req == null) throw new BizException("LEAVE_NOTICE_CONFIG_INVALID", "配置内容不能为空");
        // 合并:已存值打底,请求里有的字段覆盖。null 字段保持原值,避免前端漏字段时被清空。
        LeaveNoticeConfig merged = withDefaults(readRaw());
        if (req.getNoticeEnabled() != null) merged.setNoticeEnabled(req.getNoticeEnabled());
        if (req.getNoticeText() != null) merged.setNoticeText(req.getNoticeText());
        if (req.getCommitmentEnabled() != null) merged.setCommitmentEnabled(req.getCommitmentEnabled());
        if (req.getCommitmentText() != null) merged.setCommitmentText(req.getCommitmentText());
        if (req.getCommitmentCountdownSec() != null) merged.setCommitmentCountdownSec(req.getCommitmentCountdownSec());

        String json;
        try {
            json = objectMapper.writeValueAsString(merged);
        } catch (Exception e) {
            throw new BizException("LEAVE_NOTICE_CONFIG_WRITE_FAILED", "序列化失败:" + e.getMessage());
        }
        String tenantId = currentTenantId();
        int affected = jdbc.update("""
                UPDATE public.tenant
                   SET config = jsonb_set(COALESCE(config, '{}'::jsonb),
                                          '{leaveNoticeConfig}',
                                          ?::jsonb,
                                          true),
                       updated_at = NOW()
                 WHERE id = ?
                """, json, tenantId);
        if (affected == 0) throw new BizException("TENANT_NOT_FOUND", "租户不存在");
        log.info("Updated leaveNoticeConfig for tenant {}", tenantId);
        return merged;
    }

    private LeaveNoticeConfig readRaw() {
        try {
            String json = jdbc.queryForObject(
                    "SELECT config::text FROM public.tenant WHERE id = ?",
                    String.class, currentTenantId());
            if (json == null || json.isBlank()) return new LeaveNoticeConfig();
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(json, Map.class);
            Object node = root.get("leaveNoticeConfig");
            if (node == null) return new LeaveNoticeConfig();
            return objectMapper.convertValue(node, LeaveNoticeConfig.class);
        } catch (EmptyResultDataAccessException e) {
            return new LeaveNoticeConfig();
        } catch (Exception e) {
            log.warn("Failed to read leaveNoticeConfig, fallback to defaults: {}", e.getMessage());
            return new LeaveNoticeConfig();
        }
    }

    private LeaveNoticeConfig withDefaults(LeaveNoticeConfig in) {
        LeaveNoticeConfig out = new LeaveNoticeConfig();
        out.setNoticeEnabled(in.getNoticeEnabled() != null ? in.getNoticeEnabled() : Defaults.NOTICE_ENABLED);
        out.setNoticeText(notBlank(in.getNoticeText()) ? in.getNoticeText() : Defaults.NOTICE_TEXT);
        out.setCommitmentEnabled(in.getCommitmentEnabled() != null ? in.getCommitmentEnabled() : Defaults.COMMITMENT_ENABLED);
        out.setCommitmentText(notBlank(in.getCommitmentText()) ? in.getCommitmentText() : Defaults.COMMITMENT_TEXT);
        out.setCommitmentCountdownSec(
                in.getCommitmentCountdownSec() != null ? in.getCommitmentCountdownSec() : Defaults.COMMITMENT_COUNTDOWN_SEC);
        return out;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }
}
