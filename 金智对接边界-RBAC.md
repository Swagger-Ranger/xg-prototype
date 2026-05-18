# 金智 / 外部系统接入边界（RBAC）

> 适用：客户学校已有金智 UAP / 数据中心、CAS、企业微信等外部身份源时的最小可行接入。
> 本文是**接入边界硬约定**(可落地执行)。设计取舍与业内对照见 `RBAC设计与金智对照.md`；
> 出处为 `RBAC改造落地方案-xg1.md` §9，Sprint 4 单独成文。

## 1. 一条总原则

**只同步身份与组织，不同步权限。**

外部系统的「角色」是学校本地系统语义，不等价于 xg1 的产品角色；xg1 的权限码是产品能力
边界，必须由 xg1 控制。把金智角色直接映射成 xg1 权限会让能力边界失控、且无法版本化审计。

## 2. 同步什么（允许）

| 对象 | 落到 xg1 |
|---|---|
| 用户身份 | `sys_user.external_id`（关联键，不覆盖本地角色） |
| 组织 | `org_unit` + `org_closure` |
| 学生归属 | `student_profile.class_id` 或 `student_org_membership` |
| 辅导员 / 班主任关系 | `counselor_org_mapping`、`org_unit.leader_id` |

## 3. 不同步什么（禁止）

- ❌ 金智角色 → xg1 权限（不写 `sys_role_permission`、不碰 `RolePermissionDefaults`）
- ❌ 金智菜单 / 资源 → xg1 `sys_permission`

外部同步进来的用户，其功能权限一律走 xg1 本地：管理员在「角色权限」页确认角色，或用
导入模板批量挂 `kind='role'` 角色（与项目开发约定 §9 第 2、6 条一致）。

## 4. 需要角色映射时（P1 不急）

确有「按外部角色自动挂 xg1 角色」诉求时，再加映射表，**不内联进同步逻辑**：

```sql
external_role_mapping (
  id,
  tenant_id,
  provider,            -- jz_uap / cas / wecom
  external_role_code,
  external_role_name,
  target_role_code,    -- xg1 sys_role.code，且必须 kind='role'
  enabled,
  created_at,
  updated_at
)
```

约束：`target_role_code` 只能指向 `kind='role'`（team 不授权，见 §9 第 2 条）；映射是
显式开关（`enabled`），默认不自动提权。P1 阶段先用管理员确认 / 导入模板，不上此表。

## 5. 验收

- 外部同步只新增 / 更新身份与组织行，`sys_role_permission`、`sys_permission` 零写入。
- 外部用户首次登录后，无任何功能权限，直至 xg1 侧显式挂角色。
- 引入映射表后，`target_role_code` 指向 team 时拒绝。
