-- 加 class_monitor 角色 + demo 用户 + 挂到软件 2301 班。
--
-- 设计:
--   - 班长是 same_class scope,但不走 org_unit.leader_id(那字段是班主任专属,
--     一班一人)。改用 sys_user_role.org_id = class_id 的 dean / college_secretary
--     同款模式,允许一个班多个班长(团支书 / 副班长后续可以追加同 role 用户)。
--   - role_id=13 接 V075 序列。
--   - demo 用户 id=2404 接 V081 序列(2401-2403)。
--   - 已有流程 YAML 不动 — 用户明确说班长只是作为可选审批角色,后续主动改 YAML 才生效。

-- 1) 新角色
INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES
    (13, '${tenant_id}', 'class_monitor', '班长', '班级学生干部,可担任请销假等流程的初级审核人', TRUE, 13)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2) 基础权限(对齐 V075 模式,只发 AI 助手用)
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (13, 1103)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3) demo 用户
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash)
VALUES
    (2404, '${tenant_id}', 'monitor1', '陈班长', 'male', '13800000009', 'monitor@demo.edu', 'active',
     '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

-- 4) 挂角色 + 关联到软件 2301 班(id=1002,跟孙班主任同班)
INSERT INTO sys_user_role (user_id, role_id, org_id) VALUES
    (2404, 13, 1002)
ON CONFLICT DO NOTHING;
