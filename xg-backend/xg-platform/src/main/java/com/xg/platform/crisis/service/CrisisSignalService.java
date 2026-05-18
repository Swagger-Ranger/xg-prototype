package com.xg.platform.crisis.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.crisis.mapper.CrisisSignalMapper;
import com.xg.platform.crisis.model.CrisisSignal;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * 危机求助快速通道核心服务（脚手架，<b>默认关闭</b>）。
 *
 * <p>设计见 {@code 危机求助快速通道-设计方案.md} §4 / PRD §9.5。这是与 care
 * R001–R012 <b>并行</b>的 P1 例外通道，<b>不进规则引擎</b>。
 *
 * <p>开关 {@code xg.crisis.enabled}（默认 {@code false}）：关闭时 {@link #report}
 * 直接 no-op，对正常 chat / 业务零影响——D1/D2/D3 未拍板前不激活。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CrisisSignalService {

    static final String TEMPLATE_CODE = "CRISIS_SIGNAL_IMMEDIATE";
    private static final String SOURCE_TYPE = "crisis_signal";

    private final CrisisSignalMapper crisisSignalMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    /** 默认关闭。D1/D2/D3 未拍板前不激活（设计 §7/§9）。 */
    @Value("${xg.crisis.enabled:false}")
    private boolean enabled;

    /**
     * xg-ai 判定显式求助命中后回调入口。幂等：同一 (tenant, messageId, ruleVersion)
     * 复用同一行，不重复发首次通知（设计 §4.1）。
     *
     * <p>身份铁律（设计 §4.1）：{@code studentId} 必须是调用方<b>重校验已认证 token</b>
     * 后解析出的，不是 xg-ai 自报——本方法只接受已解析的 id，校验在内部端点完成。
     */
    public void report(Long studentId, String messageId, String ruleVersion) {
        if (!enabled) {
            log.debug("crisis channel disabled (xg.crisis.enabled=false), skip report");
            return;
        }
        if (studentId == null || messageId == null || messageId.isBlank()
                || ruleVersion == null || ruleVersion.isBlank()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST);
        }

        CrisisSignal signal = findOrCreate(studentId, messageId, ruleVersion);

        // 已成功通知过 → 幂等返回（再发会被 (source_type,source_id,template_code) 去重吞掉，
        // 此时 orchestrator 的 null 是"去重"语义，不当失败 —— 设计 §4.3）。
        if (signal.getFirstNotifiedAt() != null) {
            log.info("crisis_signal {} already notified, idempotent skip", signal.getId());
            return;
        }

        Long notificationId = notificationOrchestrator.send(
                TEMPLATE_CODE, SOURCE_TYPE, signal.getId(),
                RecipientContext.applicant(studentId), Map.of());

        if (notificationId != null) {
            signal.setNotifyStatus("sent");
            signal.setFirstNotifiedAt(OffsetDateTime.now());
        } else {
            // 设计 §4.3：send 返回 null 是歧义的（去重 / 无收件人 / 模板缺失 / 全员静默 /
            // 真失败）。本 signal 的 firstNotifiedAt 仍为空 → 无法证实已成功通知过 →
            // 一律按失败处理，绝不静默当"已送达"。响亮报错，留待人工/运维介入。
            signal.setNotifyStatus("failed");
            log.error("CRISIS notify FAILED (loud): crisis_signal={} student={} —— "
                            + "首次通知未确认成功，需人工/运维即时介入（设计 §4.3）",
                    signal.getId(), studentId);
        }
        crisisSignalMapper.updateById(signal);
    }

    /**
     * 最小关闭入口（设计 §4.4）。{@code pending → closed}，{@code handledBy} 取
     * <b>已认证身份</b>（非传参）。幂等：已 closed 再调直接返回。
     */
    public void close(Long id) {
        if (id == null) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST);
        }
        CrisisSignal signal = crisisSignalMapper.selectById(id);
        if (signal == null) {
            throw new BizException(GlobalErrorCode.NOT_FOUND);
        }
        if ("closed".equals(signal.getStatus())) {
            return;
        }
        signal.setStatus("closed");
        signal.setHandledBy(CurrentUser.id());
        signal.setHandledAt(OffsetDateTime.now());
        crisisSignalMapper.updateById(signal);
        log.info("crisis_signal {} closed by {}", id, signal.getHandledBy());
    }

    private CrisisSignal findOrCreate(Long studentId, String messageId, String ruleVersion) {
        CrisisSignal existing = selectByIdem(messageId, ruleVersion);
        if (existing != null) {
            return existing;
        }
        CrisisSignal s = new CrisisSignal();
        String tid = TenantContext.getTenantId();
        s.setTenantId((tid == null || tid.isBlank()) ? "default" : tid);
        s.setStudentId(studentId);
        s.setMessageId(messageId);
        s.setRuleVersion(ruleVersion);
        s.setStatus("pending");
        s.setCreatedAt(OffsetDateTime.now());
        try {
            crisisSignalMapper.insert(s);
            return s;
        } catch (DuplicateKeyException race) {
            // 并发回调撞幂等唯一索引 (tenant_id, message_id, rule_version) → 复用已有行
            CrisisSignal won = selectByIdem(messageId, ruleVersion);
            if (won == null) {
                throw race;
            }
            return won;
        }
    }

    private CrisisSignal selectByIdem(String messageId, String ruleVersion) {
        return crisisSignalMapper.selectOne(
                new LambdaQueryWrapper<CrisisSignal>()
                        .eq(CrisisSignal::getMessageId, messageId)
                        .eq(CrisisSignal::getRuleVersion, ruleVersion)
                        .last("LIMIT 1"));
    }
}
