package com.xg.platform.auth;

import java.util.Set;
import java.util.Map;

/**
 * 角色 → 默认权限映射，写在代码里。
 *
 * <h3>为什么放代码里而不是 DB seed</h3>
 * 35 个权限码 × 多角色 = 几百行 sys_role_permission，每个新租户都要 INSERT 一遍。
 * 沉淀到代码后：
 * <ul>
 *   <li>新租户开通仅需 INSERT 5 个 sys_role 行 + 1 行 super_admin 的 user_role</li>
 *   <li>升级版本调权限不用写 migration，只改这个文件</li>
 *   <li>{@code sys_role_permission} 表保留但只存 <b>override</b>（差异），见
 *       {@link StpInterfaceImpl} 的合并逻辑</li>
 * </ul>
 *
 * <h3>核心 6 个角色 vs 8 个老别名</h3>
 * 当前 DB 里有 13 个角色，这是历史包袱（counselor / class_master / class_monitor 是
 * 同一种"教师"身份的不同业务称谓）。一刀切删除会破坏 leave_v3 工作流（YAML 里
 * 还嵌着 'counselor' / 'dean' 等 code）。
 *
 * <p>过渡方案：核心 6 个码各自有完整默认权限；其余 8 个老角色作为<b>别名</b>，
 * 复用对应核心角色的权限集。UI 在 P3 只显示 {@link #CORE_ROLE_CODES} 里的角色，
 * 老角色对管理员不可见但对登录态依然生效。P5 数据迁移阶段才真正清理 DB。
 */
public final class RolePermissionDefaults {

    private RolePermissionDefaults() {}

    /** 通配权限 —— 仅 super_admin 用，匹配任何 perm 码。 */
    public static final String WILDCARD = "*";

    /** UI 选择 / 配置时只展示这 6 个角色码。其余老角色仅服务存量数据。 */
    public static final Set<String> CORE_ROLE_CODES = Set.of(
            "student", "teacher", "college_admin", "school_admin", "super_admin", "employer");

    /** 学生默认权限：自助类操作 + AI 助手。视野永远是"自己"。 */
    private static final Set<String> STUDENT_PERMS = Set.of(
            "leave:submit",
            "checkin:scan",
            "collection:fill",
            "knowledge:ask",
            "ai:assistant:use",
            "student:view",
            "workstudy:apply",
            "workstudy:position:view",
            "workstudy:position:apply",
            "workstudy:salary:view"
    );

    /** 教师默认权限：审批 / 管理学生信息 / 通知发送。视野走业务实体（leader_id / counselor 映射）。 */
    private static final Set<String> TEACHER_PERMS = Set.of(
            "leave:approve",
            "leave:proxy_submit",
            "leave:stats",
            "leave:manage",
            "checkin:manage",
            "collection:manage",
            "notification:send",
            "notification:manage",
            "student:view",
            "student:manage",
            "worklog:manage",
            "ai:assistant:use",
            "knowledge:ask"
    );

    /**
     * 院系管理默认权限：本院范围的请假统计 / 学生管理 / 勤工助学全周期 + 教师能做的事。
     *
     * <p>勤工助学：院级负责本院岗位的发布、关闭、申请审批以及薪酬查看。
     * 不含 setup_approve（校级审批院级岗位方案）、salary:process（校财务流程）、
     * employer:manage（全校用工单位档案），这三项归校级。
     */
    private static final Set<String> COLLEGE_ADMIN_PERMS = union(TEACHER_PERMS, Set.of(
            "leave:stats",
            "discipline:manage",
            "workstudy:manage",
            "workstudy:position:setup",
            "workstudy:position:manage",
            "workstudy:position:approve",
            "workstudy:salary:view",
            "student:manage",
            "notification:manage"
    ));

    /** 校级管理默认权限：全校范围 + 系统配置（用户 / 角色 / 组织 / 审计）。 */
    private static final Set<String> SCHOOL_ADMIN_PERMS = union(COLLEGE_ADMIN_PERMS, Set.of(
            "system:manage",
            "system:user:manage",
            "system:org:manage",
            "system:role:manage",
            "system:audit:view",
            "student:sensitive",
            "knowledge:manage",
            "workstudy:employer:manage",
            "workstudy:position:setup_approve",
            "workstudy:salary:process"
    ));

    /** 用工单位（外部）：仅勤工助学相关。 */
    private static final Set<String> EMPLOYER_PERMS = Set.of(
            "workstudy:position:setup",
            "workstudy:position:approve",
            "workstudy:position:manage",
            "workstudy:salary:process"
    );

    /**
     * role.code → 默认权限集。
     *
     * <p>核心 6 个 + 8 个别名（对应同身份的老业务称谓）。新角色添加：往
     * {@link #CORE_ROLE_CODES} 和这个 Map 里都加一行。
     */
    public static final Map<String, Set<String>> DEFAULTS = Map.ofEntries(
            // 核心
            Map.entry("student",       STUDENT_PERMS),
            Map.entry("teacher",       TEACHER_PERMS),
            Map.entry("college_admin", COLLEGE_ADMIN_PERMS),
            Map.entry("school_admin",  SCHOOL_ADMIN_PERMS),
            Map.entry("super_admin",   Set.of(WILDCARD)),
            Map.entry("employer",      EMPLOYER_PERMS),

            // 老角色别名 —— 复用核心角色权限集，待 P5 数据迁移后可删
            Map.entry("counselor",                 TEACHER_PERMS),
            Map.entry("class_master",              TEACHER_PERMS),
            Map.entry("class_monitor",             STUDENT_PERMS),
            Map.entry("dean",                      COLLEGE_ADMIN_PERMS),
            Map.entry("college_secretary",         COLLEGE_ADMIN_PERMS),
            Map.entry("student_affairs_officer",   SCHOOL_ADMIN_PERMS),
            Map.entry("student_affairs_director",  SCHOOL_ADMIN_PERMS),
            Map.entry("aid_center_officer",        SCHOOL_ADMIN_PERMS)
    );

    /** 取 role.code 的默认权限集；未知 code 返回空集（不抛异常，登录态最坏 = 0 权限）。 */
    public static Set<String> defaultsOf(String roleCode) {
        return DEFAULTS.getOrDefault(roleCode, Set.of());
    }

    private static Set<String> union(Set<String> a, Set<String> b) {
        java.util.HashSet<String> s = new java.util.HashSet<>(a);
        s.addAll(b);
        return Set.copyOf(s);
    }
}
