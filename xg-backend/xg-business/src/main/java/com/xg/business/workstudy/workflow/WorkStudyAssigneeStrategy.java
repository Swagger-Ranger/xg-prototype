package com.xg.business.workstudy.workflow;

import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.service.WorkStudyErrorCode;
import com.xg.platform.workflow.assignee.AssigneeDescriptor;
import com.xg.platform.workflow.assignee.AssigneeDescriptorProvider;
import com.xg.platform.workflow.engine.AssigneeStrategy;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Work-study specific assignees that the generic role/scope model can't express:
 *
 * <ul>
 *   <li>{@code employer_leader|same_employer} — used by 1002 workstudy_position_v1.
 *       Resolves to {@code employer.leader_user_id} of the position's employer.</li>
 *   <li>{@code position_owner|same_position} — used by 1003 workstudy_apply_v1.
 *       Resolves to {@code position.owner_user_id} of the application's position.</li>
 * </ul>
 *
 * Looks up the target via the workflow instance's bizType + bizId.
 */
@Slf4j
@Component
@Order(50)
@RequiredArgsConstructor
public class WorkStudyAssigneeStrategy implements AssigneeStrategy, AssigneeDescriptorProvider {

    private final WorkStudyPositionMapper positionMapper;
    private final WorkStudyApplicationMapper applicationMapper;
    private final EmployerMapper employerMapper;

    @Override
    public boolean supports(String role, String scope) {
        if ("employer_leader".equals(role) && "same_employer".equals(scope)) return true;
        if ("position_owner".equals(role) && "same_position".equals(scope)) return true;
        return false;
    }

    @Override
    public List<Long> resolve(String role, String scope, WorkflowInstance instance) {
        Long bizId = instance.getBizId();
        if (bizId == null) {
            log.warn("WorkStudyAssigneeStrategy: workflow instance {} has no bizId", instance.getId());
            return List.of();
        }

        if ("employer_leader".equals(role)) {
            // bizType 不匹配是流程定义配错,不能伪装成"无人可派"返回空 —— 直接报错。
            requireBizType(instance, "workstudy_position", role, scope);
            WorkStudyPosition pos = positionMapper.selectById(bizId);
            if (pos == null || pos.getEmployerId() == null) {
                log.warn("employer_leader resolve failed: position {} or its employer_id is null", bizId);
                return List.of();
            }
            Employer e = employerMapper.selectById(pos.getEmployerId());
            if (e == null || e.getLeaderUserId() == null) {
                log.warn("employer_leader resolve failed: employer {} not found or has no leader", pos.getEmployerId());
                return List.of();
            }
            return List.of(e.getLeaderUserId());
        }

        // position_owner
        requireBizType(instance, "workstudy_application", role, scope);
        WorkStudyApplication app = applicationMapper.selectById(bizId);
        if (app == null) {
            log.warn("position_owner resolve failed: application {} not found", bizId);
            return List.of();
        }
        WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
        if (pos == null || pos.getOwnerUserId() == null) {
            log.warn("position_owner resolve failed: position {} not found or has no owner_user_id", app.getPositionId());
            return List.of();
        }
        return List.of(pos.getOwnerUserId());
    }

    /**
     * bizType 与受理人策略不匹配是流程<b>定义层面的配置错误</b>,必须 fail-fast,不能返回空假装无人可派。
     *
     * <p>故意 always-on,不像 empty-assignee / publish 那样挂灰度 flag:这不是"运行时碰运气"
     * 的灰度对象,而是确定性配错;WorkflowAssigneeDryRunService 会在发布前预检同一约束,
     * 且方案 §5.9.1 审计确认存量定义零违例(employer_leader 仅配 workstudy_position、
     * position_owner 仅配 workstudy_application),故无需灰度过渡。
     */
    private void requireBizType(WorkflowInstance instance, String expected, String role, String scope) {
        if (!expected.equals(instance.getBizType())) {
            log.warn("WorkStudyAssigneeStrategy: bizType mismatch role={} scope={} expected={} actual={} instance={}",
                    role, scope, expected, instance.getBizType(), instance.getId());
            throw WorkStudyErrorCode.ASSIGNEE_BIZTYPE_MISMATCH.exception();
        }
    }

    /** 虚拟角色:登记到 catalog 才能过 validator(不进 sys_role);bizTypes 锁死适用流程。 */
    @Override
    public List<AssigneeDescriptor> descriptors() {
        return List.of(
                new AssigneeDescriptor("employer_leader", "same_employer",
                        java.util.Set.of("workstudy_position"),
                        "用人单位负责人", true, "workstudy"),
                new AssigneeDescriptor("position_owner", "same_position",
                        java.util.Set.of("workstudy_application"),
                        "岗位负责人", true, "workstudy"));
    }
}
