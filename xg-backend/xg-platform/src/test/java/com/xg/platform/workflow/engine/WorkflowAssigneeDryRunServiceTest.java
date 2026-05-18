package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.engine.WorkflowAssigneeDryRunService.UnknownAssigneeRef;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.WorkflowDefinition;
import com.xg.platform.workflow.model.WorkflowInstance;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 验证 dry-run 的三类判定:已知组合不报、无策略 → NO_STRATEGY、
 * 虚拟角色 bizType 不匹配 → BIZTYPE_MISMATCH;publicity 节点跳过;
 * 运行中实例的 snapshot 也扫。用真 stub 策略而非 mockito,贴近引擎 supports() 真实语义。
 */
class WorkflowAssigneeDryRunServiceTest {

    /** 模拟 Builtin(counselor|same_class)+ WorkStudy 虚拟角色(employer_leader|same_employer)。 */
    private final AssigneeStrategy stub = new AssigneeStrategy() {
        @Override public boolean supports(String r, String s) {
            return ("counselor".equals(r) && "same_class".equals(s))
                    || ("employer_leader".equals(r) && "same_employer".equals(s));
        }
        @Override public List<Long> resolve(String r, String s, WorkflowInstance i) { return List.of(); }
    };

    private Map<String, Object> node(String type, String id, String role, String scope) {
        return Map.of("type", type, "id", id,
                "assignee", Map.of("role", role, "scope", scope));
    }

    private WorkflowDefinition def(Long id, String bizType, List<Map<String, Object>> nodes) {
        WorkflowDefinition d = new WorkflowDefinition();
        d.setId(id);
        d.setCode("leave_v2");
        d.setVersion(2);
        d.setBizType(bizType);
        d.setConfigJson(Map.of("nodes", nodes));
        return d;
    }

    private WorkflowAssigneeDryRunService service(List<WorkflowDefinition> defs,
                                                  List<WorkflowInstance> running) {
        WorkflowDefinitionMapper dm = mock(WorkflowDefinitionMapper.class);
        WorkflowInstanceMapper im = mock(WorkflowInstanceMapper.class);
        when(dm.selectList(any())).thenReturn(defs);
        when(im.selectList(any())).thenReturn(running);
        return new WorkflowAssigneeDryRunService(List.of(stub), dm, im);
    }

    @Test
    void flagsUnknownStrategy_skipsKnownAndPublicity() {
        WorkflowDefinition d = def(1L, "leave", List.of(
                node("approval", "n1", "counselor", "same_class"),   // known
                node("publicity", "n2", "whoever", "whatever"),       // skipped
                node("approval", "n3", "conselor", "same_class")));   // typo → NO_STRATEGY

        List<UnknownAssigneeRef> r = service(List.of(d), List.of()).scan();

        assertThat(r).hasSize(1);
        assertThat(r.get(0).reason()).isEqualTo("NO_STRATEGY");
        assertThat(r.get(0).role()).isEqualTo("conselor");
        assertThat(r.get(0).source()).isEqualTo("definition");
        assertThat(r.get(0).nodeId()).isEqualTo("n3");
    }

    @Test
    void virtualRole_wrongBizType_isBizTypeMismatch_rightBizType_passes() {
        WorkflowDefinition bad = def(1L, "leave", List.of(
                node("approval", "n1", "employer_leader", "same_employer")));
        WorkflowDefinition ok = def(2L, "workstudy_position", List.of(
                node("approval", "n1", "employer_leader", "same_employer")));

        List<UnknownAssigneeRef> r = service(List.of(bad, ok), List.of()).scan();

        assertThat(r).hasSize(1);
        assertThat(r.get(0).reason()).isEqualTo("BIZTYPE_MISMATCH");
        assertThat(r.get(0).refId()).isEqualTo(1L);
        assertThat(r.get(0).bizType()).isEqualTo("leave");
    }

    @Test
    void scansRunningInstanceSnapshot() {
        WorkflowInstance inst = new WorkflowInstance();
        inst.setId(77L);
        inst.setStatus("running");
        inst.setBizType("leave");
        inst.setDefinitionSnapshot(Map.of("nodes", List.of(
                node("approval", "n1", "ghost_role", "global"))));

        List<UnknownAssigneeRef> r = service(List.of(), List.of(inst)).scan();

        assertThat(r).hasSize(1);
        assertThat(r.get(0).source()).isEqualTo("running_instance");
        assertThat(r.get(0).refId()).isEqualTo(77L);
        assertThat(r.get(0).reason()).isEqualTo("NO_STRATEGY");
    }
}
