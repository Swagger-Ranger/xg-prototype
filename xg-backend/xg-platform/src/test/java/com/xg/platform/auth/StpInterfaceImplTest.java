package com.xg.platform.auth;

import com.xg.platform.system.mapper.SysUserRoleMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * HIGH-2 真实修复回归(RBAC 落地方案 §6.2/§6.3):
 * 权限解析的 DEFAULTS 展开必须只认 kind='role'(findFunctionalRoleCodesByUserId),
 * 绝不经 findRoleCodesByUserId(含 team) —— 否则 team code 撞 DEFAULTS key 即提权。
 * getRoleList 仍返回全部(含 team)供业务 roles.contains / workflow 派发,行为不变。
 */
class StpInterfaceImplTest {

    private final SysUserRoleMapper mapper = mock(SysUserRoleMapper.class);
    private final StpInterfaceImpl impl = new StpInterfaceImpl(mapper);

    @Test
    void permissionList_expandsDefaultsFromFunctionalRolesOnly_neverFromAllRoleCodes() {
        // 用户只有 kind='role' 的 student;findRoleCodesByUserId(全部)即便含撞名 team 也不该被读
        when(mapper.findFunctionalRoleCodesByUserId(7L)).thenReturn(List.of("student"));
        when(mapper.findPermissionCodesByUserId(7L)).thenReturn(List.of());

        List<String> perms = impl.getPermissionList(7L, "login");

        assertThat(perms).contains("leave:submit");          // STUDENT_PERMS
        assertThat(perms).doesNotContain("system:manage");   // SCHOOL_ADMIN —— 不得经 team 泄漏
        // 提权那条腿已被移除:权限解析绝不调 findRoleCodesByUserId
        verify(mapper, never()).findRoleCodesByUserId(anyLong());
        verify(mapper).findFunctionalRoleCodesByUserId(7L);
    }

    @Test
    void roleList_stillReturnsAllCodesInclTeam_unchanged() {
        when(mapper.findRoleCodesByUserId(7L)).thenReturn(List.of("student", "review_team"));

        assertThat(impl.getRoleList(7L, "login")).containsExactly("student", "review_team");
        verify(mapper, never()).findFunctionalRoleCodesByUserId(anyLong());
    }
}
