-- kind='team' 是业务编组,不授予功能权限;功能权限只来自 kind='role'
-- (RBAC 落地方案 §6.2/§6.3)。代码侧已两路收口:
--   * RolePermissionAdminService.grantPerms 拒绝给 team 加权限
--   * StpInterfaceImpl 的 DB / DEFAULTS 两条腿都只认 kind='role'
-- 本迁移清掉历史上误配进 sys_role_permission 的 team 行(旧 UI / 数据导入遗留),
-- 让 DB 状态与代码约束一致。
--
-- 只删 sys_role_permission 误配置,不动 sys_user_role —— 用户与团队的成员关系
-- (workflow scope=global 派发依赖)完整保留。
--
-- Idempotent:无 team 误配时 DELETE 不命中;重跑无害。
-- 回滚提示(方案 §11):若某 team 权限有真实使用,清理前应先导出再人工迁到自定义 role。

DELETE FROM sys_role_permission rp
USING sys_role r
WHERE rp.role_id = r.id
  AND r.tenant_id = '${tenant_id}'
  AND r.kind = 'team';
