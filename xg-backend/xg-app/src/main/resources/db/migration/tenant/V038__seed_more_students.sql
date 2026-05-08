-- Diversify the student roster to exercise the 学生信息库 filters & pagination.
-- Delta: +3 colleges, +14 classes, +40 students, spread across grades 2021-2025
-- with mixed statuses. ID ranges: org 1006-1114, user 2300-2339, profile 3200-3239.

-- ── Colleges ────────────────────────────────────────────────────────────────
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status) VALUES
    (1006, '${tenant_id}', NULL, '经济管理学院', 'econ',     'college', 3, 'active'),
    (1010, '${tenant_id}', NULL, '机械工程学院', 'mech',     'college', 4, 'active'),
    (1013, '${tenant_id}', NULL, '艺术学院',     'arts',     'college', 5, 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Classes ────────────────────────────────────────────────────────────────
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, sort_order, status) VALUES
    (1101, '${tenant_id}', 1001, '计算机科学 2301 班', 'cs-csc-2301', 'class', 3, 'active'),
    (1102, '${tenant_id}', 1001, '人工智能 2401 班',   'cs-ai-2401',  'class', 4, 'active'),
    (1103, '${tenant_id}', 1001, '数据科学 2301 班',   'cs-ds-2301',  'class', 5, 'active'),
    (1104, '${tenant_id}', 1003, '新闻传播 2301 班',   'hum-jn-2301', 'class', 2, 'active'),
    (1105, '${tenant_id}', 1003, '历史学 2201 班',     'hum-hs-2201', 'class', 3, 'active'),
    (1106, '${tenant_id}', 1003, '哲学 2101 班',       'hum-ph-2101', 'class', 4, 'active'),
    (1107, '${tenant_id}', 1006, '工商管理 2301 班',   'econ-mg-2301','class', 1, 'active'),
    (1108, '${tenant_id}', 1006, '会计学 2301 班',     'econ-ac-2301','class', 2, 'active'),
    (1109, '${tenant_id}', 1006, '金融学 2401 班',     'econ-fi-2401','class', 3, 'active'),
    (1110, '${tenant_id}', 1006, '国际经贸 2501 班',   'econ-it-2501','class', 4, 'active'),
    (1111, '${tenant_id}', 1010, '机械设计 2201 班',   'mech-md-2201','class', 1, 'active'),
    (1112, '${tenant_id}', 1010, '自动化 2301 班',     'mech-au-2301','class', 2, 'active'),
    (1113, '${tenant_id}', 1013, '视觉传达 2301 班',   'arts-vc-2301','class', 1, 'active'),
    (1114, '${tenant_id}', 1013, '音乐表演 2401 班',   'arts-mp-2401','class', 2, 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Closure ────────────────────────────────────────────────────────────────
INSERT INTO org_closure (ancestor_id, descendant_id, depth) VALUES
    -- self links
    (1006, 1006, 0), (1010, 1010, 0), (1013, 1013, 0),
    (1101, 1101, 0), (1102, 1102, 0), (1103, 1103, 0),
    (1104, 1104, 0), (1105, 1105, 0), (1106, 1106, 0),
    (1107, 1107, 0), (1108, 1108, 0), (1109, 1109, 0), (1110, 1110, 0),
    (1111, 1111, 0), (1112, 1112, 0),
    (1113, 1113, 0), (1114, 1114, 0),
    -- college → class
    (1001, 1101, 1), (1001, 1102, 1), (1001, 1103, 1),
    (1003, 1104, 1), (1003, 1105, 1), (1003, 1106, 1),
    (1006, 1107, 1), (1006, 1108, 1), (1006, 1109, 1), (1006, 1110, 1),
    (1010, 1111, 1), (1010, 1112, 1),
    (1013, 1113, 1), (1013, 1114, 1)
ON CONFLICT DO NOTHING;

-- ── 40 students ────────────────────────────────────────────────────────────
-- Shared bcrypt hash for demo login (same as existing seeds).
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash) VALUES
    -- 2021级 · 哲学 2101 班
    (2300, '${tenant_id}', 'stu_qian',  '钱书雅', 'female','13900000300', 'qian@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2301, '${tenant_id}', 'stu_sunyi', '孙奕辰', 'male',  '13900000301', 'sunyi@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2022级 · 机械设计 2201 班
    (2302, '${tenant_id}', 'stu_lihao', '李昊然', 'male',  '13900000302', 'lihao@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2303, '${tenant_id}', 'stu_heyi',  '何一鸣', 'male',  '13900000303', 'heyi@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2304, '${tenant_id}', 'stu_xuj',   '许静怡', 'female','13900000304', 'xuj@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2305, '${tenant_id}', 'stu_tang',  '唐嘉豪', 'male',  '13900000305', 'tang@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2022级 · 历史学 2201 班
    (2306, '${tenant_id}', 'stu_jiang', '蒋若溪', 'female','13900000306', 'jiang@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2307, '${tenant_id}', 'stu_shen',  '沈亦安', 'male',  '13900000307', 'shen@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 计算机科学 2301 班
    (2308, '${tenant_id}', 'stu_hanm',  '韩梦瑶', 'female','13900000308', 'hanm@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2309, '${tenant_id}', 'stu_luo_zh','罗子豪', 'male',  '13900000309', 'luo-zh@demo.edu','active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2310, '${tenant_id}', 'stu_yan',   '严思齐', 'male',  '13900000310', 'yan@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 数据科学 2301 班
    (2311, '${tenant_id}', 'stu_gu',    '顾诗涵', 'female','13900000311', 'gu@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2312, '${tenant_id}', 'stu_mo',    '莫晨宇', 'male',  '13900000312', 'mo@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 新闻传播 2301 班
    (2313, '${tenant_id}', 'stu_tian',  '田语嫣', 'female','13900000313', 'tian@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2314, '${tenant_id}', 'stu_maq',   '马青松', 'male',  '13900000314', 'maq@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2315, '${tenant_id}', 'stu_bai',   '白芷若', 'female','13900000315', 'bai@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 工商管理 2301 班
    (2316, '${tenant_id}', 'stu_guo',   '郭雨桐', 'female','13900000316', 'guo@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2317, '${tenant_id}', 'stu_duan',  '段志远', 'male',  '13900000317', 'duan@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2318, '${tenant_id}', 'stu_xie',   '谢明轩', 'male',  '13900000318', 'xie@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 会计学 2301 班
    (2319, '${tenant_id}', 'stu_qiu',   '邱紫萱', 'female','13900000319', 'qiu@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2320, '${tenant_id}', 'stu_cao',   '曹芮希', 'female','13900000320', 'cao@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2321, '${tenant_id}', 'stu_yea',   '叶承宇', 'male',  '13900000321', 'yea@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 自动化 2301 班
    (2322, '${tenant_id}', 'stu_pan',   '潘博文', 'male',  '13900000322', 'pan@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2323, '${tenant_id}', 'stu_su',    '苏语彤', 'female','13900000323', 'su@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2324, '${tenant_id}', 'stu_yu',    '于泽楷', 'male',  '13900000324', 'yu@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2023级 · 视觉传达 2301 班
    (2325, '${tenant_id}', 'stu_leng',  '冷星妤', 'female','13900000325', 'leng@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2326, '${tenant_id}', 'stu_yin',   '殷皓然', 'male',  '13900000326', 'yin@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2327, '${tenant_id}', 'stu_song',  '宋朝阳', 'male',  '13900000327', 'song@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2024级 · 人工智能 2401 班
    (2328, '${tenant_id}', 'stu_lyu',   '吕梓萱', 'female','13900000328', 'lyu@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2329, '${tenant_id}', 'stu_jin',   '金子睿', 'male',  '13900000329', 'jin@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2330, '${tenant_id}', 'stu_xiang', '项书言', 'male',  '13900000330', 'xiang@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2024级 · 金融学 2401 班
    (2331, '${tenant_id}', 'stu_dai_yn','戴一诺', 'female','13900000331', 'dai-yn@demo.edu','active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2332, '${tenant_id}', 'stu_yuan',  '袁沐辰', 'male',  '13900000332', 'yuan@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2333, '${tenant_id}', 'stu_luyu',  '陆雨萌', 'female','13900000333', 'luyu@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2024级 · 音乐表演 2401 班
    (2334, '${tenant_id}', 'stu_kong',  '孔清越', 'female','13900000334', 'kong@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2335, '${tenant_id}', 'stu_bu',    '卜嘉树', 'male',  '13900000335', 'bu@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2336, '${tenant_id}', 'stu_fang',  '方怀瑾', 'female','13900000336', 'fang@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    -- 2025级 · 国际经贸 2501 班
    (2337, '${tenant_id}', 'stu_qi',    '齐昕悦', 'female','13900000337', 'qi@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2338, '${tenant_id}', 'stu_shi',   '石奕彤', 'female','13900000338', 'shi@demo.edu',   'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2339, '${tenant_id}', 'stu_ning',  '宁景行', 'male',  '13900000339', 'ning@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2300, 1), (2301, 1), (2302, 1), (2303, 1), (2304, 1), (2305, 1), (2306, 1), (2307, 1), (2308, 1), (2309, 1),
    (2310, 1), (2311, 1), (2312, 1), (2313, 1), (2314, 1), (2315, 1), (2316, 1), (2317, 1), (2318, 1), (2319, 1),
    (2320, 1), (2321, 1), (2322, 1), (2323, 1), (2324, 1), (2325, 1), (2326, 1), (2327, 1), (2328, 1), (2329, 1),
    (2330, 1), (2331, 1), (2332, 1), (2333, 1), (2334, 1), (2335, 1), (2336, 1), (2337, 1), (2338, 1), (2339, 1)
ON CONFLICT DO NOTHING;

INSERT INTO student_profile (id, tenant_id, user_id, student_no, grade, college, major, class_name, class_id, enrollment_date, status) VALUES
    -- 2021级 · 哲学 2101 班
    (3200, '${tenant_id}', 2300, '2021001001', '2021级', '人文学院',     '哲学',                       '哲学 2101 班',       1106, '2021-09-01', 'graduated'),
    (3201, '${tenant_id}', 2301, '2021001002', '2021级', '人文学院',     '哲学',                       '哲学 2101 班',       1106, '2021-09-01', 'active'),
    -- 2022级 · 机械设计 2201 班
    (3202, '${tenant_id}', 2302, '2022001001', '2022级', '机械工程学院', '机械设计制造及其自动化',     '机械设计 2201 班',   1111, '2022-09-01', 'active'),
    (3203, '${tenant_id}', 2303, '2022001002', '2022级', '机械工程学院', '机械设计制造及其自动化',     '机械设计 2201 班',   1111, '2022-09-01', 'active'),
    (3204, '${tenant_id}', 2304, '2022001003', '2022级', '机械工程学院', '机械设计制造及其自动化',     '机械设计 2201 班',   1111, '2022-09-01', 'suspended'),
    (3205, '${tenant_id}', 2305, '2022001004', '2022级', '机械工程学院', '机械设计制造及其自动化',     '机械设计 2201 班',   1111, '2022-09-01', 'active'),
    -- 2022级 · 历史学 2201 班
    (3206, '${tenant_id}', 2306, '2022001005', '2022级', '人文学院',     '历史学',                     '历史学 2201 班',     1105, '2022-09-01', 'active'),
    (3207, '${tenant_id}', 2307, '2022001006', '2022级', '人文学院',     '历史学',                     '历史学 2201 班',     1105, '2022-09-01', 'withdrawn'),
    -- 2023级 · 计算机科学 2301 班
    (3208, '${tenant_id}', 2308, '2023001111', '2023级', '计算机学院',   '计算机科学与技术',           '计算机科学 2301 班', 1101, '2023-09-01', 'active'),
    (3209, '${tenant_id}', 2309, '2023001112', '2023级', '计算机学院',   '计算机科学与技术',           '计算机科学 2301 班', 1101, '2023-09-01', 'active'),
    (3210, '${tenant_id}', 2310, '2023001113', '2023级', '计算机学院',   '计算机科学与技术',           '计算机科学 2301 班', 1101, '2023-09-01', 'active'),
    -- 2023级 · 数据科学 2301 班
    (3211, '${tenant_id}', 2311, '2023001114', '2023级', '计算机学院',   '数据科学与大数据技术',       '数据科学 2301 班',   1103, '2023-09-01', 'active'),
    (3212, '${tenant_id}', 2312, '2023001115', '2023级', '计算机学院',   '数据科学与大数据技术',       '数据科学 2301 班',   1103, '2023-09-01', 'active'),
    -- 2023级 · 新闻传播 2301 班
    (3213, '${tenant_id}', 2313, '2023001116', '2023级', '人文学院',     '新闻学',                     '新闻传播 2301 班',   1104, '2023-09-01', 'active'),
    (3214, '${tenant_id}', 2314, '2023001117', '2023级', '人文学院',     '新闻学',                     '新闻传播 2301 班',   1104, '2023-09-01', 'active'),
    (3215, '${tenant_id}', 2315, '2023001118', '2023级', '人文学院',     '新闻学',                     '新闻传播 2301 班',   1104, '2023-09-01', 'suspended'),
    -- 2023级 · 工商管理 2301 班
    (3216, '${tenant_id}', 2316, '2023001119', '2023级', '经济管理学院', '工商管理',                   '工商管理 2301 班',   1107, '2023-09-01', 'active'),
    (3217, '${tenant_id}', 2317, '2023001120', '2023级', '经济管理学院', '工商管理',                   '工商管理 2301 班',   1107, '2023-09-01', 'active'),
    (3218, '${tenant_id}', 2318, '2023001121', '2023级', '经济管理学院', '工商管理',                   '工商管理 2301 班',   1107, '2023-09-01', 'active'),
    -- 2023级 · 会计学 2301 班
    (3219, '${tenant_id}', 2319, '2023001122', '2023级', '经济管理学院', '会计学',                     '会计学 2301 班',     1108, '2023-09-01', 'active'),
    (3220, '${tenant_id}', 2320, '2023001123', '2023级', '经济管理学院', '会计学',                     '会计学 2301 班',     1108, '2023-09-01', 'active'),
    (3221, '${tenant_id}', 2321, '2023001124', '2023级', '经济管理学院', '会计学',                     '会计学 2301 班',     1108, '2023-09-01', 'active'),
    -- 2023级 · 自动化 2301 班
    (3222, '${tenant_id}', 2322, '2023001125', '2023级', '机械工程学院', '自动化',                     '自动化 2301 班',     1112, '2023-09-01', 'active'),
    (3223, '${tenant_id}', 2323, '2023001126', '2023级', '机械工程学院', '自动化',                     '自动化 2301 班',     1112, '2023-09-01', 'active'),
    (3224, '${tenant_id}', 2324, '2023001127', '2023级', '机械工程学院', '自动化',                     '自动化 2301 班',     1112, '2023-09-01', 'active'),
    -- 2023级 · 视觉传达 2301 班
    (3225, '${tenant_id}', 2325, '2023001128', '2023级', '艺术学院',     '视觉传达设计',               '视觉传达 2301 班',   1113, '2023-09-01', 'active'),
    (3226, '${tenant_id}', 2326, '2023001129', '2023级', '艺术学院',     '视觉传达设计',               '视觉传达 2301 班',   1113, '2023-09-01', 'active'),
    (3227, '${tenant_id}', 2327, '2023001130', '2023级', '艺术学院',     '视觉传达设计',               '视觉传达 2301 班',   1113, '2023-09-01', 'active'),
    -- 2024级 · 人工智能 2401 班
    (3228, '${tenant_id}', 2328, '2024001001', '2024级', '计算机学院',   '人工智能',                   '人工智能 2401 班',   1102, '2024-09-01', 'active'),
    (3229, '${tenant_id}', 2329, '2024001002', '2024级', '计算机学院',   '人工智能',                   '人工智能 2401 班',   1102, '2024-09-01', 'active'),
    (3230, '${tenant_id}', 2330, '2024001003', '2024级', '计算机学院',   '人工智能',                   '人工智能 2401 班',   1102, '2024-09-01', 'active'),
    -- 2024级 · 金融学 2401 班
    (3231, '${tenant_id}', 2331, '2024001004', '2024级', '经济管理学院', '金融学',                     '金融学 2401 班',     1109, '2024-09-01', 'active'),
    (3232, '${tenant_id}', 2332, '2024001005', '2024级', '经济管理学院', '金融学',                     '金融学 2401 班',     1109, '2024-09-01', 'active'),
    (3233, '${tenant_id}', 2333, '2024001006', '2024级', '经济管理学院', '金融学',                     '金融学 2401 班',     1109, '2024-09-01', 'active'),
    -- 2024级 · 音乐表演 2401 班
    (3234, '${tenant_id}', 2334, '2024001007', '2024级', '艺术学院',     '音乐表演',                   '音乐表演 2401 班',   1114, '2024-09-01', 'active'),
    (3235, '${tenant_id}', 2335, '2024001008', '2024级', '艺术学院',     '音乐表演',                   '音乐表演 2401 班',   1114, '2024-09-01', 'active'),
    (3236, '${tenant_id}', 2336, '2024001009', '2024级', '艺术学院',     '音乐表演',                   '音乐表演 2401 班',   1114, '2024-09-01', 'suspended'),
    -- 2025级 · 国际经贸 2501 班
    (3237, '${tenant_id}', 2337, '2025001001', '2025级', '经济管理学院', '国际经济与贸易',             '国际经贸 2501 班',   1110, '2025-09-01', 'active'),
    (3238, '${tenant_id}', 2338, '2025001002', '2025级', '经济管理学院', '国际经济与贸易',             '国际经贸 2501 班',   1110, '2025-09-01', 'active'),
    (3239, '${tenant_id}', 2339, '2025001003', '2025级', '经济管理学院', '国际经济与贸易',             '国际经贸 2501 班',   1110, '2025-09-01', 'active')
ON CONFLICT (tenant_id, student_no) DO NOTHING;
