package com.xg.platform.crisis.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.care.service.CareAdminAccess;
import com.xg.platform.crisis.dto.CrisisSignalDetail;
import com.xg.platform.crisis.dto.CrisisSignalListItem;
import com.xg.platform.crisis.mapper.CrisisQueryMapper;
import com.xg.platform.crisis.mapper.CrisisSignalAuditMapper;
import com.xg.platform.crisis.mapper.CrisisSignalMapper;
import com.xg.platform.crisis.model.CrisisSignal;
import com.xg.platform.crisis.model.CrisisSignalAudit;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    /** 区二「小夕画像」最多回看的关怀/请假/违纪条数（够辅导员判断即可，不做无界拉取）。 */
    private static final int RECENT_LIMIT = 5;

    private final CrisisSignalMapper crisisSignalMapper;
    private final NotificationOrchestrator notificationOrchestrator;
    private final CrisisQueryMapper crisisQueryMapper;
    private final CrisisSignalAuditMapper crisisSignalAuditMapper;
    private final AssigneeLookupMapper assigneeLookup;
    private final ObjectMapper objectMapper;

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
    public void report(Long studentId, String messageId, String ruleVersion, String category) {
        if (!enabled) {
            log.debug("crisis channel disabled (xg.crisis.enabled=false), skip report");
            return;
        }
        if (studentId == null || messageId == null || messageId.isBlank()
                || ruleVersion == null || ruleVersion.isBlank()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST);
        }
        // category 是分诊增强、非安全必需：缺失不拦截危机信号（安全优先，宁可少一行分类）。

        CrisisSignal signal = findOrCreate(studentId, messageId, ruleVersion, category);

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

    // ─────────────────────── 工作台读视图（设计 §4/§5）───────────────────────

    /**
     * 「危机·需立即人工核实」泳道：当前登录辅导员名下学生的 <b>pending</b> 危机线索。
     *
     * <p>权限口径与 care 一致（{@link CareAdminAccess}）：管理角色看本校全部，普通辅导员
     * 只看「自己负责的学生」——经 {@link AssigneeLookupMapper#findCounselorsOfStudent}
     * 反查（与危机通知收件人解析同一条双轨 SQL，口径不可能漂移）。crisis_signal 无
     * assigned_to，越权过滤只能落在「学生归谁管」这层，不能信前端。
     */
    public List<CrisisSignalListItem> listForCurrentCounselor() {
        List<CrisisSignal> pending = crisisSignalMapper.selectList(
                new LambdaQueryWrapper<CrisisSignal>()
                        .eq(CrisisSignal::getStatus, "pending")
                        .orderByDesc(CrisisSignal::getCreatedAt));
        if (pending.isEmpty()) {
            return List.of();
        }
        Long me = CurrentUser.id();
        boolean manager = CareAdminAccess.isManager(CareAdminAccess.currentRoles());

        List<CrisisSignal> visible = new ArrayList<>(pending.size());
        for (CrisisSignal s : pending) {
            if (canAccess(s.getStudentId(), me, manager)) {
                visible.add(s);
            }
        }
        if (visible.isEmpty()) {
            return List.of();
        }
        Map<Long, String[]> students = resolveStudents(visible.stream()
                .map(CrisisSignal::getStudentId).toList());

        List<CrisisSignalListItem> out = new ArrayList<>(visible.size());
        for (CrisisSignal s : visible) {
            String[] sc = students.get(s.getStudentId());
            out.add(new CrisisSignalListItem(
                    s.getId(), s.getStudentId(),
                    sc == null ? null : sc[0],
                    sc == null ? null : sc[1],
                    s.getCreatedAt(), s.getStatus(), s.getNotifyStatus()));
        }
        return out;
    }

    /**
     * 危机详情。先鉴权（同 list 口径），<b>再写一条 view 审计</b>（设计 §5：危机详情
     * 谁在何时看了都必须可追溯，比普通关怀更严），最后组装两区：
     * 区一/区二非画像部分全纯 DB；区二画像复用关怀侧已算结果、缺失即降级 null。
     */
    public CrisisSignalDetail detail(Long id) {
        if (id == null) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST);
        }
        CrisisSignal s = crisisSignalMapper.selectById(id);
        if (s == null) {
            throw new BizException(GlobalErrorCode.NOT_FOUND);
        }
        Long me = CurrentUser.id();
        List<String> roles = CareAdminAccess.currentRoles();
        boolean manager = CareAdminAccess.isManager(roles);
        if (!canAccess(s.getStudentId(), me, manager)) {
            throw new BizException(GlobalErrorCode.FORBIDDEN);
        }
        audit(s.getId(), "view", me, manager ? CareAdminAccess.actorRole(roles) : "counselor");

        String tid = TenantContext.getTenantId();
        Map<Long, String[]> nameCls = resolveStudents(List.of(s.getStudentId()));
        Map<String, Object> core = resolveStudentExtra(tid, s.getStudentId());
        String[] sc = nameCls.get(s.getStudentId());

        return new CrisisSignalDetail(
                s.getId(), s.getStudentId(),
                sc == null ? null : sc[0],
                sc == null ? null : sc[1],
                asStr(core.get("grade")),
                asStr(core.get("studentNo")),
                asStr(core.get("phone")),
                s.getCreatedAt(), s.getRuleVersion(), s.getCategory(), s.getStatus(),
                s.getNotifyStatus(), s.getHandledAt(), s.getHandledBy(),
                crisisQueryMapper.careHistoryCount(tid, s.getStudentId()),
                crisisQueryMapper.recentCare(tid, s.getStudentId(), RECENT_LIMIT),
                crisisQueryMapper.recentLeave(tid, s.getStudentId(), RECENT_LIMIT),
                crisisQueryMapper.recentViolation(tid, s.getStudentId(), RECENT_LIMIT),
                latestBrief(tid, s.getStudentId()));
    }

    /**
     * 最小关闭入口（设计 §4.4）。{@code pending → closed}，{@code handledBy} 取
     * <b>已认证身份</b>（非传参）。幂等：已 closed 再调直接返回。关闭写一条 close 审计。
     */
    public void close(Long id) {
        if (id == null) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST);
        }
        CrisisSignal signal = crisisSignalMapper.selectById(id);
        if (signal == null) {
            throw new BizException(GlobalErrorCode.NOT_FOUND);
        }
        // 关闭也要鉴权：只有该生的辅导员 / 管理角色能关，不能凭 id 越权关别人的线索。
        Long me = CurrentUser.id();
        List<String> roles = CareAdminAccess.currentRoles();
        boolean manager = CareAdminAccess.isManager(roles);
        if (!canAccess(signal.getStudentId(), me, manager)) {
            throw new BizException(GlobalErrorCode.FORBIDDEN);
        }
        if ("closed".equals(signal.getStatus())) {
            return;
        }
        signal.setStatus("closed");
        signal.setHandledBy(me);
        signal.setHandledAt(OffsetDateTime.now());
        crisisSignalMapper.updateById(signal);
        audit(signal.getId(), "close", me, manager ? CareAdminAccess.actorRole(roles) : "counselor");
        log.info("crisis_signal {} closed by {}", id, signal.getHandledBy());
    }

    // ─────────────────────────── 鉴权 / 审计 / 解析 helpers ───────────────────────────

    /** 管理角色看全部；否则当前用户必须在「该生管事辅导员」集合内（双轨语义同通知收件人）。 */
    private boolean canAccess(Long studentId, Long me, boolean manager) {
        if (manager) {
            return true;
        }
        return me != null && studentId != null
                && assigneeLookup.findCounselorsOfStudent(studentId).contains(me);
    }

    /** append-only 审计写入（设计 §5）。失败不阻断主流程，但响亮记日志。 */
    private void audit(Long signalId, String action, Long actorId, String actorRole) {
        try {
            CrisisSignalAudit a = new CrisisSignalAudit();
            String tid = TenantContext.getTenantId();
            a.setTenantId((tid == null || tid.isBlank()) ? "default" : tid);
            a.setSignalId(signalId);
            a.setAction(action);
            a.setActorId(actorId);
            a.setActorRole(actorRole);
            a.setCreatedAt(OffsetDateTime.now());
            crisisSignalAuditMapper.insert(a);
        } catch (Exception e) {
            log.error("crisis audit write FAILED (loud): signal={} action={} actor={}",
                    signalId, action, actorId, e);
        }
    }

    /** 批量解析 studentId → [name, className]，复用危机查询（与 care resolveStudents 同义）。 */
    private Map<Long, String[]> resolveStudents(List<Long> studentIds) {
        Set<Long> ids = new LinkedHashSet<>(studentIds);
        ids.remove(null);
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, String[]> out = new HashMap<>();
        for (Map<String, Object> r : crisisQueryMapper.resolveStudentCore(
                TenantContext.getTenantId(), new ArrayList<>(ids))) {
            Long sid = asLong(r.get("studentId"));
            if (sid == null) {
                continue;
            }
            out.put(sid, new String[]{asStr(r.get("studentName")), asStr(r.get("className"))});
        }
        return out;
    }

    /** 单个学生的区一补充字段（grade / studentNo / phone）。无 profile 时返回空 Map。 */
    private Map<String, Object> resolveStudentExtra(String tid, Long studentId) {
        List<Map<String, Object>> rows =
                crisisQueryMapper.resolveStudentCore(tid, List.of(studentId));
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    /**
     * 区二小夕画像：复用关怀侧已算好的最近一份 brief。<b>不触发新 AI</b>（设计 §1
     * crisis 不依赖 AI）。解析失败 / 无数据一律 null → 前端降级，不抛、不阻断区一。
     */
    private Map<String, Object> latestBrief(String tid, Long studentId) {
        try {
            String json = crisisQueryMapper.latestStudentBriefJson(tid, studentId);
            if (json == null || json.isBlank()) {
                return null;
            }
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("crisis latestBrief parse skipped (AI 降级，不阻断) student={}: {}",
                    studentId, e.getMessage());
            return null;
        }
    }

    private static Long asLong(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(o.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String asStr(Object o) {
        return o == null ? null : o.toString();
    }

    private CrisisSignal findOrCreate(Long studentId, String messageId,
                                      String ruleVersion, String category) {
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
        s.setCategory(category);
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
