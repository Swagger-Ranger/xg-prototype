-- P1: 角色降维第一步 —— 加 teacher 一个统一身份角色。
--
-- 背景：现有 13 个角色里 counselor / class_master / class_monitor 是同一种"教师"
-- 身份的不同业务称谓（前两个对应 org_unit.leader_id / counselor_org_mapping，
-- 班长本质是学生扮演的角色）。把它们的"权限定义"统一成 teacher 一个角色，
-- "实际管谁"完全交给业务实体（leader_id / counselor 映射）来决定。
--
-- 本迁移只做加法 —— **不删任何老角色，不改 sys_user_role 数据**：
--   1) INSERT teacher (id=14, code='teacher')
--   2) 老角色 (counselor / class_master / class_monitor / dean / college_secretary
--      / student_affairs_officer / aid_center_officer / student_affairs_director)
--      在 RolePermissionDefaults 里以"别名"形式映射到 teacher / college_admin /
--      school_admin 的权限集，DEFAULTS 写在 Java 代码里，本迁移不动 sys_role_permission。
--
-- 老用户的老角色行 / 老工作流 YAML 里的 role code 字符串都继续生效。
-- 真正的"清理 8 个老角色 + 工作流 YAML 改写"留给 P5 数据迁移 phase。
--
-- Idempotent：sys_role unique 在 (tenant_id, code)，冲突跳过。

INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES
    (14, '${tenant_id}', 'teacher', '教师',
     '统一教师身份。具体职责（班主任 / 辅导员 / 班长）通过业务实体识别，不再依赖角色码。',
     TRUE, 14)
ON CONFLICT (tenant_id, code) DO NOTHING;
