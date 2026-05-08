package com.xg.business.workstudy.workflow;

import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
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
public class WorkStudyAssigneeStrategy implements AssigneeStrategy {

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
            // bizType expected: workstudy_position → bizId = position.id
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
        // bizType expected: workstudy_application → bizId = application.id
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
}
