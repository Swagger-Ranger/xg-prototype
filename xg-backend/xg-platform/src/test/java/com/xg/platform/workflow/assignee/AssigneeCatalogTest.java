package com.xg.platform.workflow.assignee;

import com.xg.platform.system.mapper.SysRoleMapper;
import com.xg.platform.system.model.SysRole;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 验证 catalog 的 supports 三条线:静态命中(bizType 不限)、虚拟角色 bizType 锁、
 * scope=global 动态(role/team 皆可、不在 sys_role 则否),以及 listAll 含动态项。
 */
class AssigneeCatalogTest {

    private final AssigneeDescriptorProvider builtin = () -> List.of(
            new AssigneeDescriptor("counselor", "same_class", Set.of(), "班级辅导员", false, "core"),
            new AssigneeDescriptor("student_affairs_officer", "global", Set.of(), "学工处", false, "core"));

    private final AssigneeDescriptorProvider workstudy = () -> List.of(
            new AssigneeDescriptor("employer_leader", "same_employer",
                    Set.of("workstudy_position"), "用人单位负责人", true, "workstudy"),
            new AssigneeDescriptor("position_owner", "same_position",
                    Set.of("workstudy_application"), "岗位负责人", true, "workstudy"));

    private SysRole role(String code, String name, String kind) {
        SysRole r = new SysRole();
        r.setCode(code);
        r.setName(name);
        r.setKind(kind);
        return r;
    }

    private AssigneeCatalog catalog() {
        SysRoleMapper sm = mock(SysRoleMapper.class);
        when(sm.selectList(any())).thenReturn(List.of(
                role("school_admin", "校管理员", "role"),
                role("review_team", "评审委员会", "team")));
        return new AssigneeCatalog(List.of(builtin, workstudy), sm);
    }

    @Test
    void staticDescriptor_anyBizType_supported() {
        assertThat(catalog().supports("counselor", "same_class", "leave")).isTrue();
        assertThat(catalog().supports("counselor", "same_class", "workstudy_salary")).isTrue();
    }

    @Test
    void virtualRole_bizTypeLocked() {
        assertThat(catalog().supports("employer_leader", "same_employer", "workstudy_position")).isTrue();
        assertThat(catalog().supports("employer_leader", "same_employer", "leave")).isFalse();
        assertThat(catalog().supports("position_owner", "same_position", "workstudy_application")).isTrue();
    }

    @Test
    void typoAndWrongScope_notSupported() {
        assertThat(catalog().supports("conselor", "same_class", "leave")).isFalse();
        assertThat(catalog().supports("counselor", "same_clazz", "leave")).isFalse();
    }

    @Test
    void globalScope_roleAndTeamBothResolve_unknownRejected() {
        AssigneeCatalog c = catalog();
        assertThat(c.supports("school_admin", "global", "leave")).isTrue();   // kind=role
        assertThat(c.supports("review_team", "global", "leave")).isTrue();    // kind=team (§5.3)
        assertThat(c.supports("ghost_role", "global", "leave")).isFalse();    // 不在 sys_role
    }

    @Test
    void listAll_hasStaticAndDynamicGlobal() {
        List<AssigneeDescriptor> all = catalog().listAll();
        assertThat(all).anyMatch(d -> d.role().equals("counselor") && d.scope().equals("same_class"));
        assertThat(all).anyMatch(d -> d.role().equals("employer_leader") && d.virtual());
        // 动态:每个 sys_role 一条 scope=global
        assertThat(all).anyMatch(d -> d.role().equals("school_admin") && d.scope().equals("global")
                && "dynamic".equals(d.ownerModule()));
        assertThat(all).anyMatch(d -> d.role().equals("review_team") && d.scope().equals("global"));
    }
}
