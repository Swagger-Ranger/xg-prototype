-- Demo dataset so the /students, /complaints, counselor-scope features have something to show.
-- Structure: 1 college → 1 class → 1 counselor + 5 students.
-- IDs are allocated in the 1000-4999 range to avoid collision with V020 role/permission seeds.

-- Org units: college + class
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status)
VALUES
    (1001, '${tenant_id}', NULL, '计算机学院',   'cs',         'college', 1, 'active'),
    (1002, '${tenant_id}', 1001, '软件 2301 班', 'cs-sw-2301', 'class',   1, 'active')
ON CONFLICT (id) DO NOTHING;

-- Closure table (self-links + college → class path)
INSERT INTO org_closure (ancestor_id, descendant_id, depth) VALUES
    (1001, 1001, 0),
    (1002, 1002, 0),
    (1001, 1002, 1)
ON CONFLICT DO NOTHING;

-- Counselor user
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status)
VALUES (2001, '${tenant_id}', 'counselor_li', '李老师', 'female', '13800000001', 'li@demo.edu', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES (2001, 2)
ON CONFLICT DO NOTHING;

-- Counselor manages the software class
INSERT INTO counselor_org_mapping (id, tenant_id, counselor_id, org_id, is_primary)
VALUES (4001, '${tenant_id}', 2001, 1002, TRUE)
ON CONFLICT (counselor_id, org_id) DO NOTHING;

-- Five demo students
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status) VALUES
    (2011, '${tenant_id}', 'stu_zhang', '张晓明', 'male',   '13900000011', 'zhang@demo.edu', 'active'),
    (2012, '${tenant_id}', 'stu_wang',  '王丽华', 'female', '13900000012', 'wang@demo.edu',  'active'),
    (2013, '${tenant_id}', 'stu_chen',  '陈思远', 'male',   '13900000013', 'chen@demo.edu',  'active'),
    (2014, '${tenant_id}', 'stu_liu',   '刘婷婷', 'female', '13900000014', 'liu@demo.edu',   'active'),
    (2015, '${tenant_id}', 'stu_zhao',  '赵宇航', 'male',   '13900000015', 'zhao@demo.edu',  'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2011, 1), (2012, 1), (2013, 1), (2014, 1), (2015, 1)
ON CONFLICT DO NOTHING;

INSERT INTO student_profile (id, tenant_id, user_id, student_no, grade, college, major, class_name, class_id, enrollment_date, status) VALUES
    (3011, '${tenant_id}', 2011, '2023001001', '2023级', '计算机学院', '软件工程', '软件 2301 班', 1002, '2023-09-01', 'active'),
    (3012, '${tenant_id}', 2012, '2023001002', '2023级', '计算机学院', '软件工程', '软件 2301 班', 1002, '2023-09-01', 'active'),
    (3013, '${tenant_id}', 2013, '2023001003', '2023级', '计算机学院', '软件工程', '软件 2301 班', 1002, '2023-09-01', 'active'),
    (3014, '${tenant_id}', 2014, '2023001004', '2023级', '计算机学院', '软件工程', '软件 2301 班', 1002, '2023-09-01', 'active'),
    (3015, '${tenant_id}', 2015, '2023001005', '2023级', '计算机学院', '软件工程', '软件 2301 班', 1002, '2023-09-01', 'active')
ON CONFLICT (tenant_id, student_no) DO NOTHING;
