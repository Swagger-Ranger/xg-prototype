-- Demo 书院制数据:让 enable_residential_track=true 时,学生页确实有数据可显。
--
-- 设计:
--   · 2 所书院(明德 / 弘毅),书院之下挂 4 个"书院班"。
--   · 书院班"跨学院 + 跨年级"混编 —— 这是书院制行政班的核心特点,跟学院班(学术班)正交。
--   · 复用 org_unit.type = 'dorm_block' 字符串承载"书院班"语义(避免再加新 type 改 SQL,
--     未来真做"宿舍楼栋"再用别的字符串)。前端 label / yaml 文案统一改成"书院班"。
--
-- ID 区间:org 12001-12099(避开学院线 1001-1199 已经被 V038 扩到 1114,
-- 也避开 90000+ 这种动态分配的;12000 段空白安全)。membership 用 IDENTITY 不分配。
-- 默认对所有 demo 租户启用 toggle —— 单租户场景没影响,真接入时校管理员可关。

-- ── 1. 书院(academy) + 书院班(复用 dorm_block) ───────────────────
INSERT INTO org_unit (id, tenant_id, parent_id, name, code, type, track, sort_order, status) VALUES
    (12001, '${tenant_id}', NULL,  '明德书院', 'mingde',     'academy',    'residential', 1, 'active'),
    (12002, '${tenant_id}', NULL,  '弘毅书院', 'hongyi',     'academy',    'residential', 2, 'active'),
    (12011, '${tenant_id}', 12001, '明德 1 班', 'mingde-c1', 'dorm_block', 'residential', 1, 'active'),
    (12012, '${tenant_id}', 12001, '明德 2 班', 'mingde-c2', 'dorm_block', 'residential', 2, 'active'),
    (12021, '${tenant_id}', 12002, '弘毅 1 班', 'hongyi-c1', 'dorm_block', 'residential', 1, 'active'),
    (12022, '${tenant_id}', 12002, '弘毅 2 班', 'hongyi-c2', 'dorm_block', 'residential', 2, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_closure (ancestor_id, descendant_id, depth) VALUES
    (12001, 12001, 0),
    (12002, 12002, 0),
    (12011, 12011, 0),
    (12012, 12012, 0),
    (12021, 12021, 0),
    (12022, 12022, 0),
    (12001, 12011, 1),
    (12001, 12012, 1),
    (12002, 12021, 1),
    (12002, 12022, 1)
ON CONFLICT DO NOTHING;

-- ── 2. 学生 → 书院班:打散现有 10 个学生,展示跨学院/年级混编效果 ───
-- 学院线现状(V021/V027):
--   软件 2301: 张晓明(2011) 王丽华(2012) 陈思远(2013) 刘婷婷(2014) 赵宇航(2015)
--   软件 2302: 孙志强(2016) 周佳怡(2017) 吴海涛(2018)
--   汉语言 2301: 郑雅琴(2019) 冯梓睿(2020)
--
-- 书院线分配(每个班 2-3 人,跨学院年级):
--   明德 1 班(12011): 2011 张晓明(软件) + 2017 周佳怡(软件) + 2019 郑雅琴(汉语言)
--   明德 2 班(12012): 2012 王丽华(软件) + 2018 吴海涛(软件)
--   弘毅 1 班(12021): 2013 陈思远(软件) + 2020 冯梓睿(汉语言)
--   弘毅 2 班(12022): 2014 刘婷婷(软件) + 2015 赵宇航(软件) + 2016 孙志强(软件)
INSERT INTO student_org_membership (tenant_id, student_user_id, org_unit_id) VALUES
    ('${tenant_id}', 2011, 12011),
    ('${tenant_id}', 2017, 12011),
    ('${tenant_id}', 2019, 12011),
    ('${tenant_id}', 2012, 12012),
    ('${tenant_id}', 2018, 12012),
    ('${tenant_id}', 2013, 12021),
    ('${tenant_id}', 2020, 12021),
    ('${tenant_id}', 2014, 12022),
    ('${tenant_id}', 2015, 12022),
    ('${tenant_id}', 2016, 12022)
ON CONFLICT (student_user_id, org_unit_id) DO NOTHING;

-- ── 3. 默认启用书院制 toggle(只对 demo 数据有意义)───────────────
-- V095 默认 false,这里覆盖为 true,这样开发环境一上来就能看到双轨视图。
-- 真生产租户接入时由校管理员通过 /api/v1/system/tenant-settings 控制。
UPDATE tenant_settings
   SET setting_value = 'true', updated_at = NOW()
 WHERE tenant_id = '${tenant_id}' AND setting_key = 'enable_residential_track';
