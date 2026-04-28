-- Demo employer (用工单位) account aligned with V022's other quick-login users.
-- Creates one example employer org_unit (后勤服务中心), one user (employer1),
-- and the role+org binding so the assignee lookup can resolve the org later.
--
-- Why a separate org_unit "type='employer'": deans bind to college, employers
-- should bind to a department-like unit. Reusing org_unit avoids a second
-- table for a tiny relationship. Idempotent via ON CONFLICT.

-- 1) employer org_unit (id=1500 to stay above the existing 1001-1114 class/college range)
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status)
VALUES (1500, '${tenant_id}', NULL, '后勤服务中心', 'EMP_LOGISTICS', 'employer', 1500, 'active')
ON CONFLICT (id) DO NOTHING;

-- 2) demo user employer1 (id=2201) — same BCrypt hash as the other demos
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash)
VALUES
    (2201, '${tenant_id}', 'employer1', '吴主管', 'female', '13800000006', 'employer@demo.edu', 'active',
     '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

-- 3) bind to employer role (8) with org_id=1500 so workflows targeting
--    "employer of this department" can resolve.
INSERT INTO sys_user_role (user_id, role_id, org_id)
VALUES (2201, 8, 1500)
ON CONFLICT (user_id, role_id) DO UPDATE SET org_id = EXCLUDED.org_id;
