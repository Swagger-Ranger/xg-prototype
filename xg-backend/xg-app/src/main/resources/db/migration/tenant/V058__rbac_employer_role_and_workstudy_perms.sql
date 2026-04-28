-- RBAC: introduce 用工单位 (employer) role and 10 fine-grained permissions
-- aligned with the role/feature matrix the product owner specified.
--
-- Strategy:
-- - Insert employer role with id=8 (only spare slot below sys_role.id=10).
-- - Insert 10 new sys_permission rows (911-919 in workstudy band, 1103 for
--   ai:assistant:use right after knowledge:* band).
-- - Add new rows to sys_role_permission. We DO NOT remove existing role
--   bindings — the matrix from product is for *new* feature gates; ripping
--   out old grants would block pages that currently rely on them (dean
--   viewing student info, counselor managing collections, etc). The role
--   editor UI lets admins prune later when they actually audit.
-- - Coarse-grained workstudy:apply / workstudy:manage stay (existing code
--   may still check them); fine-grained codes are additive.
--
-- Idempotent via ON CONFLICT.

-- ---------------------- new role ----------------------
INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES (8, '${tenant_id}', 'employer', '用工单位', '勤工助学岗位发布与薪酬流程的执行方', TRUE, 8)
ON CONFLICT (id) DO NOTHING;

-- ---------------------- new permissions ----------------------
INSERT INTO sys_permission (id, tenant_id, code, name, module, type, is_builtin)
VALUES
    (911,  '${tenant_id}', 'workstudy:position:view',           '岗位查看',         'workstudy', 'button', TRUE),
    (912,  '${tenant_id}', 'workstudy:position:apply',          '岗位申请',         'workstudy', 'button', TRUE),
    (913,  '${tenant_id}', 'workstudy:position:approve',        '岗位申请审批',     'workstudy', 'button', TRUE),
    (914,  '${tenant_id}', 'workstudy:position:setup',          '发起岗位设定',     'workstudy', 'button', TRUE),
    (915,  '${tenant_id}', 'workstudy:position:setup_approve',  '岗位设定审批',     'workstudy', 'button', TRUE),
    (916,  '${tenant_id}', 'workstudy:position:manage',         '岗位管理',         'workstudy', 'menu',   TRUE),
    (917,  '${tenant_id}', 'workstudy:salary:view',             '薪酬查看',         'workstudy', 'button', TRUE),
    (918,  '${tenant_id}', 'workstudy:salary:process',          '薪酬流程',         'workstudy', 'button', TRUE),
    (919,  '${tenant_id}', 'workstudy:employer:manage',         '用工单位管理',     'workstudy', 'menu',   TRUE),
    (1103, '${tenant_id}', 'ai:assistant:use',                  'AI 助手',          'ai',        'button', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------- role-permission bindings ----------------------
-- helper: union of (role_id, perm_id) tuples to insert.
-- ON CONFLICT prevents re-adding existing pairs.
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES
    -- student (1): + AI助手, workstudy 自助 + 薪酬查看
    (1, 1103),
    (1, 911),
    (1, 912),
    (1, 917),

    -- counselor (2): + AI助手 (其余 leave 权限早已分配)
    (2, 1103),

    -- dean (4): + AI助手
    (4, 1103),

    -- student_affairs_officer / 处管 (5): + AI助手 + 岗位设定审批 + 岗位管理 + 用工单位管理
    (5, 1103),
    (5, 915),
    (5, 916),
    (5, 919),

    -- school_admin (6): + AI助手 + 所有 9 个细分 workstudy 权限
    (6, 1103),
    (6, 911),
    (6, 912),
    (6, 913),
    (6, 914),
    (6, 915),
    (6, 916),
    (6, 917),
    (6, 918),
    (6, 919),

    -- employer (8): 4 项 workstudy 流程权限
    (8, 913),  -- 审批学生申请
    (8, 914),  -- 发起岗位设定
    (8, 916),  -- 岗位管理
    (8, 918)   -- 薪酬流程
ON CONFLICT (role_id, permission_id) DO NOTHING;
