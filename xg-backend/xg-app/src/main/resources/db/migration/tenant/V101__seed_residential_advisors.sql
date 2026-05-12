-- Demo 书院导师 —— 让"书院接管"语义有真数据可跑。
--
-- 模型(V0.3):
--   · 不引入新角色,沿用 teacher。"管哪些 org" 由 counselor_org_mapping 决定。
--   · 一个 teacher 挂某 dorm_block(书院班)  → 该 user 就是这个书院班的"导师"。
--   · 审批正向: 学生在 residential 班 → 走该班导师;没在 → fallback 学院辅导员。
--   · 审批反向: 辅导员"管的请假" = union(学院 path,residential path) 排除已被接管的。
--
-- ID 区间: user 2003-2004(避开 counselor_li=2001 / counselor_wang=2002 / 学生 2011-2020),
--          mapping 4101-4104(避开 4001-4003)。

-- ── 1. 明德/弘毅 导师用户 ─────────────────────────────
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash) VALUES
    (2003, '${tenant_id}', 'advisor_mingde', '明德导师', 'female', '13800000003', 'mingde@demo.edu', 'active',
     '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2004, '${tenant_id}', 'advisor_hongyi', '弘毅导师', 'male',   '13800000004', 'hongyi@demo.edu', 'active',
     '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

-- 跟现有"counselor 别名" pattern 一致挂 role_id=2(counselor),
-- 在 RolePermissionDefaults 里 counselor 复用 TEACHER_PERMS,跟 teacher 等价。
INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2003, 2),
    (2004, 2)
ON CONFLICT DO NOTHING;

-- ── 2. counselor_org_mapping: 挂书院班 ────────────────
-- V100 已经建好 4 个书院班: 12011/12012(明德 1/2), 12021/12022(弘毅 1/2)。
-- 明德导师管明德 1/2 班;弘毅导师管弘毅 1/2 班。is_primary=TRUE 跟其他班一致。
INSERT INTO counselor_org_mapping (id, tenant_id, counselor_id, org_id, is_primary) VALUES
    (4101, '${tenant_id}', 2003, 12011, TRUE),
    (4102, '${tenant_id}', 2003, 12012, TRUE),
    (4103, '${tenant_id}', 2004, 12021, TRUE),
    (4104, '${tenant_id}', 2004, 12022, TRUE)
ON CONFLICT (counselor_id, org_id) DO NOTHING;
