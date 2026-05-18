package com.xg.platform.system.service;

import com.xg.common.exception.BizException;
import com.xg.platform.system.dto.GrantRolePermsRequest;
import com.xg.platform.system.mapper.RolePermissionAdminMapper;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * §6.2/§6.3:team 是业务编组,不授予功能权限。grantPerms 命中 kind='team' 必须
 * 在写 sys_role_permission 之前拒绝,且不落任何插入。
 */
@ExtendWith(MockitoExtension.class)
class RolePermissionAdminServiceTest {

    @Mock RolePermissionAdminMapper mapper;
    @InjectMocks RolePermissionAdminService service;

    @Test
    void grantPerms_onTeam_rejectedBeforeAnyInsert() {
        Map<String, Object> teamRow = new HashMap<>();
        teamRow.put("id", 1L);
        teamRow.put("kind", "team");
        when(mapper.findRoleByCode("review_team")).thenReturn(List.of(teamRow));

        GrantRolePermsRequest req = new GrantRolePermsRequest();
        req.setPermCodes(List.of("leave:approve"));

        assertThatThrownBy(() -> service.grantPerms("review_team", req))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("团队不授予功能权限");

        verify(mapper, never()).insertRolePermission(anyLong(), anyLong());
    }

    /** §8.2:矩阵 = DEFAULTS ∪ override,wildcard 展开为全表,各列排序。 */
    @Test
    void effectiveMatrix_mergesDefaultsOverride_andExpandsWildcard() {
        Map<String, Object> student = new HashMap<>();
        student.put("id", 1L);
        student.put("code", "student");
        student.put("name", "学生");
        Map<String, Object> superAdmin = new HashMap<>();
        superAdmin.put("id", 2L);
        superAdmin.put("code", "super_admin");
        superAdmin.put("name", "超级管理员");
        when(mapper.listRoles("role", null, null)).thenReturn(List.of(student, superAdmin));
        when(mapper.findOverridePermCodes(1L)).thenReturn(List.of("custom:extra"));
        when(mapper.findOverridePermCodes(2L)).thenReturn(List.of());
        when(mapper.listAllPermissions()).thenReturn(List.of(
                Map.of("code", "b:two"), Map.of("code", "a:one")));

        var matrix = service.effectiveMatrix();

        assertThat(matrix).hasSize(2);

        var s = matrix.get(0);
        assertThat(s.getCode()).isEqualTo("student");
        assertThat(s.getDefaultPermissions()).contains("leave:submit").isSorted();
        assertThat(s.getOverridePermissions()).containsExactly("custom:extra");
        assertThat(s.getEffectivePermissions())
                .contains("leave:submit", "custom:extra").isSorted();

        var sa = matrix.get(1);
        assertThat(sa.getDefaultPermissions()).containsExactly("*");
        assertThat(sa.getEffectivePermissions()).containsExactly("a:one", "b:two"); // 展开+排序

        // 显式钉死 kind='role' 入参:矩阵不含 team(§6.2),非依赖 Mockito strict-stub 副作用
        verify(mapper).listRoles("role", null, null);
    }
}
