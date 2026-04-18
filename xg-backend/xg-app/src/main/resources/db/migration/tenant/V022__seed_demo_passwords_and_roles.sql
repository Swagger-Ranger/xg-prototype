-- Give every demo account the same BCrypt hash of "xg@123456" so the login page
-- can one-click as any role. Adds one extra account per unseeded role.
-- BCrypt $2b$10$... is accepted by Hutool's BCrypt.checkpw.

-- Backfill password_hash for V021-seeded users (counselor + 5 students)
UPDATE sys_user
SET password_hash = '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'
WHERE id IN (2001, 2011, 2012, 2013, 2014, 2015)
  AND (password_hash IS NULL OR password_hash = '');

-- Additional demo users: one per remaining role.
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash) VALUES
    (2101, '${tenant_id}', 'college_admin1', '钱院管', 'male',   '13800000002', 'college@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2102, '${tenant_id}', 'dean1',          '赵院长', 'male',   '13800000003', 'dean@demo.edu',     'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2103, '${tenant_id}', 'officer1',       '周学工', 'female', '13800000004', 'officer@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2104, '${tenant_id}', 'admin1',         '王管理', 'male',   '13800000005', 'admin@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

-- Role assignments (role ids from V020): 3=college_admin, 4=dean, 5=student_affairs_officer, 6=school_admin
INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2101, 3),
    (2102, 4),
    (2103, 5),
    (2104, 6)
ON CONFLICT DO NOTHING;
