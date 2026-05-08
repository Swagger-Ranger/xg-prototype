package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * The hardcoded role+scope combinations the engine resolves directly. Kept as a
 * single bean for compactness — each case hits a different lookup query and the
 * set is small. New specialised combinations should be added as their own bean
 * with tighter @Order so they match first.
 *
 * V075 added 2 entries for the 请销假 P0 design (§7.0-A): {@code class_master}
 * and {@code college_secretary}. {@code student_affairs_director} has scope
 * {@code global} and falls through to {@link GlobalRoleStrategy} which already
 * resolves any {@code sys_role.code} tenant-wide — no entry needed here.
 */
@Component
@Order(100)
@RequiredArgsConstructor
public class BuiltinAssigneeStrategy implements AssigneeStrategy {

    private static final Set<String> SUPPORTED = Set.of(
            "counselor|same_class",
            "class_master|same_class",
            "class_monitor|same_class",
            "dean|same_college",
            "college_secretary|same_college",
            "student_affairs_officer|global",
            "student|self"
    );

    private final AssigneeLookupMapper lookup;

    @Override
    public boolean supports(String role, String scope) {
        return SUPPORTED.contains(role + "|" + scope);
    }

    @Override
    public List<Long> resolve(String role, String scope, WorkflowInstance instance) {
        Long initiatorId = instance.getInitiatorId();
        return switch (role) {
            case "counselor" -> lookup.findCounselorsOfStudent(initiatorId);
            case "class_master" -> lookup.findClassMasterOfStudent(initiatorId);
            case "class_monitor" -> lookup.findClassRoleHoldersOfStudent("class_monitor", initiatorId);
            case "dean" -> lookup.findDeansOfStudent(initiatorId);
            case "college_secretary" -> lookup.findCollegeRoleHoldersOfStudent("college_secretary", initiatorId);
            case "student_affairs_officer" -> lookup.findStudentAffairsOfficers();
            case "student" -> List.of(initiatorId);
            default -> List.of();
        };
    }
}
