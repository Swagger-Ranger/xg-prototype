package com.xg.platform.care.service;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.care.mapper.CareTaskAuditMapper;
import com.xg.platform.care.mapper.CareTaskMapper;
import com.xg.platform.care.model.CareTask;
import com.xg.platform.care.model.CareTaskAudit;
import com.xg.platform.care.rule.RuleHit;
import com.xg.platform.care.rule.RuleSpec;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 《主动关怀任务去重与冷却落地方案》§6 必测用例（可纯 Mockito 覆盖的部分）。
 * §6.1（10 学生 top5）/ §6.6（多租户调度）需真 DB / Spring 上下文，归 docker 集成阶段，见
 * docs/W2-规则埋点backlog.md。
 */
@ExtendWith(MockitoExtension.class)
class CareTaskRuleMatchServiceTest {

    @Mock CareTaskMapper careTaskMapper;
    @Mock CareTaskAuditMapper careTaskAuditMapper;
    @Mock AssigneeLookupMapper assigneeLookupMapper;

    @InjectMocks CareTaskRuleMatchService service;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId("t1");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private RuleSpec spec(String ruleId, String severity, int cooldownDays) {
        return new RuleSpec(ruleId, "测试规则", "学业", severity, cooldownDays,
                RuleSpec.EvalKind.COUNT_THRESHOLD, List.of("checkin_absent"), 3, 5, null, null);
    }

    private RuleHit hit(long studentId) {
        return new RuleHit(studentId, "近 5 天缺课 3 次",
                Map.of("rule_id", "R001", "matched_count", 3));
    }

    private CareTask openTask(String status, String severity, int triggerCount, OffsetDateTime dueAt) {
        CareTask t = new CareTask();
        t.setId(900L);
        t.setTenantId("t1");
        t.setStudentId(1L);
        t.setRuleId("R001");
        t.setStatus(status);
        t.setSeverity(severity);
        t.setTriggerCount(triggerCount);
        t.setDueAt(dueAt);
        return t;
    }

    // ── §6.2 同一学生同一规则未关闭再次命中 → 合并，不新建 ──
    @Test
    void merge_into_open_task_increments_trigger_count_no_insert() {
        CareTask open = openTask("pending", "medium", 1, OffsetDateTime.now().plusDays(7));
        when(careTaskMapper.selectList(any())).thenReturn(List.of(open));

        CareTaskUpsertResult result = service.upsert(spec("R001", "medium", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.MERGED);
        verify(careTaskMapper, never()).insert(any(CareTask.class));

        ArgumentCaptor<CareTask> taskCap = ArgumentCaptor.forClass(CareTask.class);
        verify(careTaskMapper).updateById(taskCap.capture());
        assertThat(taskCap.getValue().getTriggerCount()).isEqualTo(2);
        assertThat(taskCap.getValue().getLastTriggeredAt()).isNotNull();

        ArgumentCaptor<CareTaskAudit> auditCap = ArgumentCaptor.forClass(CareTaskAudit.class);
        verify(careTaskAuditMapper).insert(auditCap.capture());
        assertThat(auditCap.getValue().getAction()).isEqualTo("evidence_appended");
    }

    // ── §6.5 严重度升级：medium 任务被 critical 命中 → 升级 + 收紧 due_at ──
    @Test
    void merge_with_higher_severity_upgrades_and_tightens_due() {
        OffsetDateTime originalDue = OffsetDateTime.now().plusDays(7);
        CareTask open = openTask("accepted", "medium", 1, originalDue);
        when(careTaskMapper.selectList(any())).thenReturn(List.of(open));

        CareTaskUpsertResult result = service.upsert(spec("R001", "critical", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.MERGED);
        ArgumentCaptor<CareTask> taskCap = ArgumentCaptor.forClass(CareTask.class);
        verify(careTaskMapper).updateById(taskCap.capture());
        assertThat(taskCap.getValue().getSeverity()).isEqualTo("critical");
        // critical=24h，必须早于原 medium 的 7 天
        assertThat(taskCap.getValue().getDueAt()).isBefore(originalDue);

        ArgumentCaptor<CareTaskAudit> auditCap = ArgumentCaptor.forClass(CareTaskAudit.class);
        verify(careTaskAuditMapper).insert(auditCap.capture());
        assertThat(auditCap.getValue().getAction()).isEqualTo("severity_upgraded");
    }

    // ── §6.3 关闭后冷却期内再次命中 → 抑制，不新建 ──
    @Test
    void suppressed_when_in_cooldown() {
        CareTask closed = openTask("resolved", "medium", 1, OffsetDateTime.now());
        closed.setCooldownUntil(OffsetDateTime.now().plusDays(5));
        when(careTaskMapper.selectList(any()))
                .thenReturn(List.of())          // findOpenTask: 无
                .thenReturn(List.of(closed));   // findLatestClosedTask: 在冷却

        CareTaskUpsertResult result = service.upsert(spec("R001", "medium", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.SUPPRESSED);
        verify(careTaskMapper, never()).insert(any(CareTask.class));
        ArgumentCaptor<CareTaskAudit> auditCap = ArgumentCaptor.forClass(CareTaskAudit.class);
        verify(careTaskAuditMapper).insert(auditCap.capture());
        assertThat(auditCap.getValue().getAction()).isEqualTo("suppressed_by_cooldown");
    }

    // ── §6.4 冷却期结束后再次命中 → 新建一轮 ──
    @Test
    void new_round_after_cooldown_expired() {
        CareTask closed = openTask("resolved", "medium", 1, OffsetDateTime.now());
        closed.setCooldownUntil(OffsetDateTime.now().minusDays(1)); // 冷却已过
        when(careTaskMapper.selectList(any()))
                .thenReturn(List.of())
                .thenReturn(List.of(closed));
        when(assigneeLookupMapper.findPrimaryCounselorOfStudent(1L)).thenReturn(100L);

        CareTaskUpsertResult result = service.upsert(spec("R001", "critical", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.CREATED);
        verify(careTaskMapper).insert(any(CareTask.class));
    }

    // ── 正常新建 + SLA 由 severity 派生（critical=24h）──
    @Test
    void create_sets_due_at_from_severity_sla() {
        when(careTaskMapper.selectList(any())).thenReturn(List.of()).thenReturn(List.of());
        when(assigneeLookupMapper.findPrimaryCounselorOfStudent(1L)).thenReturn(100L);

        CareTaskUpsertResult result = service.upsert(spec("R001", "critical", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.CREATED);
        ArgumentCaptor<CareTask> cap = ArgumentCaptor.forClass(CareTask.class);
        verify(careTaskMapper).insert(cap.capture());
        CareTask created = cap.getValue();
        assertThat(created.getStatus()).isEqualTo("pending");
        assertThat(created.getSeverity()).isEqualTo("critical");
        assertThat(created.getAssignedTo()).isEqualTo(100L);
        assertThat(created.getTriggerCount()).isEqualTo(1);
        OffsetDateTime now = OffsetDateTime.now();
        assertThat(created.getDueAt())
                .isAfter(now.plusHours(23)).isBefore(now.plusHours(25));
    }

    // ── 解析不到辅导员 → 跳过（assigned_to NOT NULL）──
    @Test
    void skipped_when_no_assignee() {
        when(careTaskMapper.selectList(any())).thenReturn(List.of()).thenReturn(List.of());
        when(assigneeLookupMapper.findPrimaryCounselorOfStudent(1L)).thenReturn(null);
        when(assigneeLookupMapper.findClassMasterOfStudent(1L)).thenReturn(List.of());

        CareTaskUpsertResult result = service.upsert(spec("R001", "high", 3), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.SKIPPED_NO_ASSIGNEE);
        verify(careTaskMapper, never()).insert(any(CareTask.class));
    }

    // ── 并发兜底：partial unique index 撞车 → DuplicateKey 视为已处理 ──
    @Test
    void duplicate_key_on_insert_returns_suppressed() {
        when(careTaskMapper.selectList(any())).thenReturn(List.of()).thenReturn(List.of());
        when(assigneeLookupMapper.findPrimaryCounselorOfStudent(1L)).thenReturn(100L);
        when(careTaskMapper.insert(any(CareTask.class))).thenThrow(new DuplicateKeyException("dup open"));

        CareTaskUpsertResult result = service.upsert(spec("R001", "critical", 7), hit(1L));

        assertThat(result).isEqualTo(CareTaskUpsertResult.SUPPRESSED);
    }
}
