-- NOTE: This migration seeds default roles and permissions for a new tenant.
-- The placeholder '${tenant_id}' is replaced at runtime by TenantService before
-- this script is applied to each tenant's schema. Do NOT run this file directly
-- against the database without substituting the placeholder first.

-- ============ 7 Built-in Roles ============
INSERT INTO sys_role (id, tenant_id, code, name, description, is_builtin, sort_order)
VALUES
    (1, '${tenant_id}', 'student',                  '学生',       '在校学生', TRUE, 1),
    (2, '${tenant_id}', 'counselor',                '辅导员',     '辅导员/班主任', TRUE, 2),
    (3, '${tenant_id}', 'college_admin',            '院系管理员', '院系级管理人员', TRUE, 3),
    (4, '${tenant_id}', 'dean',                     '院系领导',   '院长/副院长', TRUE, 4),
    (5, '${tenant_id}', 'student_affairs_officer',  '学工处人员', '学生工作处人员', TRUE, 5),
    (6, '${tenant_id}', 'school_admin',             '校级管理员', '校级系统管理员', TRUE, 6),
    (7, '${tenant_id}', 'super_admin',              '超级管理员', '平台超级管理员', TRUE, 7)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ============ Core Permissions ============
INSERT INTO sys_permission (id, tenant_id, code, name, module, type, is_builtin)
VALUES
    -- System management
    (101, '${tenant_id}', 'system:manage',         '系统管理',       'system', 'menu', TRUE),
    (102, '${tenant_id}', 'system:user:manage',    '用户管理',       'system', 'menu', TRUE),
    (103, '${tenant_id}', 'system:org:manage',     '组织架构管理',   'system', 'menu', TRUE),
    (104, '${tenant_id}', 'system:role:manage',    '角色权限管理',   'system', 'menu', TRUE),
    (105, '${tenant_id}', 'system:audit:view',     '审计日志查看',   'system', 'menu', TRUE),

    -- Leave
    (201, '${tenant_id}', 'leave:submit',          '提交请假',       'leave', 'button', TRUE),
    (202, '${tenant_id}', 'leave:approve',         '审批请假',       'leave', 'button', TRUE),
    (203, '${tenant_id}', 'leave:manage',          '请假管理',       'leave', 'menu', TRUE),
    (204, '${tenant_id}', 'leave:stats',           '请假统计',       'leave', 'menu', TRUE),
    (205, '${tenant_id}', 'leave:proxy_submit',    '代提交请假',     'leave', 'button', TRUE),

    -- Info Collection
    (301, '${tenant_id}', 'collection:fill',       '填写收集单',     'collection', 'button', TRUE),
    (302, '${tenant_id}', 'collection:manage',     '收集单管理',     'collection', 'menu', TRUE),

    -- Check-in
    (401, '${tenant_id}', 'checkin:scan',          '扫码签到',       'checkin', 'button', TRUE),
    (402, '${tenant_id}', 'checkin:manage',        '签到管理',       'checkin', 'menu', TRUE),

    -- Notification
    (501, '${tenant_id}', 'notification:send',     '发送通知',       'notification', 'button', TRUE),
    (502, '${tenant_id}', 'notification:manage',   '通知管理',       'notification', 'menu', TRUE),

    -- Complaint
    (601, '${tenant_id}', 'complaint:submit',      '提交投诉',       'complaint', 'button', TRUE),
    (602, '${tenant_id}', 'complaint:handle',      '处理投诉',       'complaint', 'menu', TRUE),

    -- Work Log
    (701, '${tenant_id}', 'worklog:manage',        '工作日志管理',   'worklog', 'menu', TRUE),

    -- Student Profile
    (801, '${tenant_id}', 'student:view',          '查看学生信息',   'student', 'menu', TRUE),
    (802, '${tenant_id}', 'student:manage',        '学生信息管理',   'student', 'menu', TRUE),
    (803, '${tenant_id}', 'student:sensitive',     '查看敏感字段',   'student', 'data', TRUE),

    -- Work Study
    (901, '${tenant_id}', 'workstudy:apply',       '申请勤工助学',   'workstudy', 'button', TRUE),
    (902, '${tenant_id}', 'workstudy:manage',      '勤工助学管理',   'workstudy', 'menu', TRUE),

    -- Discipline
    (1001, '${tenant_id}', 'discipline:manage',    '违纪管理',       'discipline', 'menu', TRUE),

    -- Knowledge
    (1101, '${tenant_id}', 'knowledge:ask',        '知识问答',       'knowledge', 'button', TRUE),
    (1102, '${tenant_id}', 'knowledge:manage',     '知识库管理',     'knowledge', 'menu', TRUE)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ============ Role-Permission Assignments ============
-- student
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (1, 201), (1, 301), (1, 401), (1, 601), (1, 801), (1, 901), (1, 1101)
ON CONFLICT DO NOTHING;

-- counselor
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (2, 202), (2, 203), (2, 204), (2, 205), (2, 302), (2, 402), (2, 501), (2, 502), (2, 701), (2, 801), (2, 802)
ON CONFLICT DO NOTHING;

-- college_admin
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (3, 204), (3, 302), (3, 502), (3, 801), (3, 802)
ON CONFLICT DO NOTHING;

-- dean
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (4, 202), (4, 204), (4, 302), (4, 502), (4, 801), (4, 802), (4, 902), (4, 1001)
ON CONFLICT DO NOTHING;

-- student_affairs_officer
INSERT INTO sys_role_permission (role_id, permission_id)
VALUES (5, 602), (5, 801), (5, 802), (5, 902), (5, 1001)
ON CONFLICT DO NOTHING;

-- school_admin (all permissions)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 6, id FROM sys_permission WHERE tenant_id = '${tenant_id}'
ON CONFLICT DO NOTHING;
