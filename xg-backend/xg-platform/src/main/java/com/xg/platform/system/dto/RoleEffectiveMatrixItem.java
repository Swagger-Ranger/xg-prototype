package com.xg.platform.system.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * GET /api/v1/system/roles/effective-matrix 的单行:某 kind='role' 角色的
 * 默认 / override / 生效权限码(均已排序,便于版本间 diff 审计)。RBAC 落地方案 §8.2。
 */
@Getter
@Setter
public class RoleEffectiveMatrixItem {
    private String code;
    private String name;
    /** 代码 RolePermissionDefaults 写死的默认集;super_admin 为 ["*"]。 */
    private List<String> defaultPermissions;
    /** sys_role_permission 里管理员手工加的 override。 */
    private List<String> overridePermissions;
    /** 实际生效集 = default ∪ override;wildcard 角色展开为全部 perm code。 */
    private List<String> effectivePermissions;
}
