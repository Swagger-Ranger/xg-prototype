-- 角色补齐：为 P0 请销假配置管理设计文档（v0.5）§7.0-A 工单。
-- 现有 sys_role 把"辅导员/班主任"合在 counselor 一个角色里，
-- 也没有"院系书记"和"学工部部长"——这导致请销假 approvalChain
-- 想表达"长事假需要院系党务把关"或"考试周升一级到部长"时，
-- 只能借用 dean / student_affairs_officer，语义不准。
--
-- 本迁移做三件事：
--   1) 增加 3 个内置角色：class_master / college_secretary /
--      student_affairs_director（id 10-12，V058 已占 id=9）。
--   2) 修正 counselor.description，把"辅导员/班主任"改回单一职责。
--   3) 给 3 个新角色绑定基础权限：仅 ai:assistant:use（1103），
--      具体业务权限留给后续 RBAC 编辑 UI 或独立工单按需补齐——
--      这里不做大批量绑定，避免越权污染既有页面授权。
--
-- 不做的事：
--   - 不给 demo 用户挂新角色（demo seed 走独立迁移更清晰）。
--   - 不动 dean / student_affairs_officer 现有 role_id 与权限。
--
-- Idempotent：sys_role 用 (tenant_id, code) 冲突跳过；
-- sys_role_permission 用 (role_id, permission_id) 冲突跳过；
-- counselor 描述 UPDATE 条件包含旧值，避免重复执行覆盖人工编辑。

-- ---------------------- 1) 新增角色 ----------------------
INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES
    (10, '${tenant_id}', 'class_master',              '班主任',     '班级日常管理与请假审核', TRUE, 10),
    (11, '${tenant_id}', 'college_secretary',         '院系书记',   '院系党委副书记 / 学生工作书记', TRUE, 11),
    (12, '${tenant_id}', 'student_affairs_director',  '学工部部长', '学生工作部部长 / 处长',         TRUE, 12)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ---------------------- 2) 修正 counselor 描述 ----------------------
-- V020 写的是"辅导员/班主任"——v0.5 设计已把班主任独立成 class_master，
-- 描述要回归单一职责。
UPDATE sys_role
   SET description = '辅导员，负责所辖班级学生的日常事务',
       updated_at  = NOW()
 WHERE tenant_id   = '${tenant_id}'
   AND code        = 'counselor'
   AND description = '辅导员/班主任';

-- ---------------------- 3) 基础权限绑定 ----------------------
-- 仅给 AI 助手；其它业务权限随各业务线 RBAC 实施单独补齐。
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES
    (10, 1103),  -- class_master              + ai:assistant:use
    (11, 1103),  -- college_secretary         + ai:assistant:use
    (12, 1103)   -- student_affairs_director  + ai:assistant:use
ON CONFLICT (role_id, permission_id) DO NOTHING;
