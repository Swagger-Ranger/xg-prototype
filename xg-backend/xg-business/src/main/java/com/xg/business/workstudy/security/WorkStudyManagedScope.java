package com.xg.business.workstudy.security;

import java.util.List;
import java.util.Set;

/**
 * 勤工助学「仅管辖范围只读」视角的判定。
 *
 * <p>辅导员 / 班主任 / 院长（counselor / class_master / dean）不参与勤工助学的任何
 * 审批与运营，但产品上允许他们「了解」自己管辖范围内学生的在岗勤工情况。这类用户
 * 在勤工助学里只看总览（在岗学生名单），且 applications / salaries 这两个携带学生
 * PII 的列表端点必须按「我管辖的学生集合」硬收口 —— 否则经 AI 面板 / 直连 API 仍能
 * 拿到全校数据，违背「仅能查看自己管辖范围学生」的约束。
 *
 * <p>判定与 {@code listApplications} 里既有的 {@code isEmployerOnly} 同构：先看是否
 * 命中受限角色，再排除「真正的勤工运营/管理角色」—— 兼任 school_admin / 学工处 /
 * 资助中心 / employer 的用户保留其更宽视角，不被本规则降级。student 已在 controller
 * 上游强制 studentId，这里把它列进排除集只是防御性兜底。
 */
public final class WorkStudyManagedScope {

    /** 命中其一即为「管辖范围只读」候选。 */
    private static final Set<String> SCOPED_ROLES = Set.of("counselor", "class_master", "dean");

    /**
     * 命中其一即说明该用户另有更宽的勤工视角，本规则不生效。
     * 与 WorkStudySalaryService.ADMIN_LIKE_ROLES 对齐，再并入 employer / student，
     * 避免兼任 super_admin / 学工部部长 / employer 的人被误降级为「只读了解」。
     */
    private static final Set<String> OVERRIDE_ROLES = Set.of(
            "school_admin", "student_affairs_officer", "student_affairs_director",
            "aid_center_officer", "super_admin", "employer", "student");

    private WorkStudyManagedScope() {
    }

    public static boolean isManagedScopeViewer(List<String> roles) {
        if (roles == null || roles.isEmpty()) {
            return false;
        }
        return roles.stream().anyMatch(SCOPED_ROLES::contains)
                && roles.stream().noneMatch(OVERRIDE_ROLES::contains);
    }
}
