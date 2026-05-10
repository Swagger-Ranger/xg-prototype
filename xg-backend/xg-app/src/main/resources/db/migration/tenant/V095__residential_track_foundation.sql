-- 双轨制（学院 + 书院）数据基础。无书院的学校：track 缺省 academic, 行为完全不变。
-- 真正切换到双轨：(1) 给 org_unit 插书院树（type='academy'/'dorm_block', track='residential'）
--                  (2) 给学生 student_org_membership 加生活线那条 row
--                  (3) tenant_settings.enable_residential_track = true

-- ---------------------- 1. org_unit 加 track 字段 ----------------------
-- 'academic'  = 学术线 (学院 / 专业 / 班级)
-- 'residential' = 生活线 (书院 / 楼栋 / 楼层)
-- 老数据全部按 academic 处理 (兼容老制度,反正 residential 树没有就不显示)。
ALTER TABLE org_unit ADD COLUMN IF NOT EXISTS track VARCHAR(16) NOT NULL DEFAULT 'academic';

CREATE INDEX IF NOT EXISTS idx_org_unit_track ON org_unit(track);

COMMENT ON COLUMN org_unit.track IS '组织树归属轨道:academic 学术线 / residential 生活线';

-- ---------------------- 2. 学生归属 N:N ----------------------
-- 学生跟 org_unit 是多对多:
--   单轨学校  → 1 行  (tenant_id, student_user_id, class_org_unit_id)
--   双轨学校  → 2 行  (tenant_id, student_user_id, 学术 class_id) + (..., residential dorm_block_id)
-- 用 unique 防止重复 INSERT, 用 cascade 跟 student_profile 删除联动 (学生退学清理 membership)。
CREATE TABLE IF NOT EXISTS student_org_membership (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    student_user_id BIGINT NOT NULL,
    org_unit_id     BIGINT NOT NULL REFERENCES org_unit(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (student_user_id, org_unit_id)
);
CREATE INDEX idx_student_org_membership_user ON student_org_membership(student_user_id);
CREATE INDEX idx_student_org_membership_org ON student_org_membership(org_unit_id);
CREATE INDEX idx_student_org_membership_tenant ON student_org_membership(tenant_id);

COMMENT ON TABLE student_org_membership IS '学生 ↔ 组织单位 多对多绑定 (单轨制 1 行 / 双轨制 2 行)';

-- 把存量 student_profile.class_id 一次性写进 membership。
-- ON CONFLICT 是为了反复跑 migration 不出错。
INSERT INTO student_org_membership (tenant_id, student_user_id, org_unit_id)
SELECT sp.tenant_id, sp.user_id, sp.class_id
FROM student_profile sp
WHERE sp.class_id IS NOT NULL
  AND sp.deleted_at IS NULL
ON CONFLICT (student_user_id, org_unit_id) DO NOTHING;

-- ---------------------- 3. 租户级别开关 ----------------------
-- 全局 setting 表 (key-value),avoid 给每个 feature flag 加 column。
-- 当前只放一个 enable_residential_track,以后 tenant 级别 toggle 都走这。
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id     VARCHAR(32) NOT NULL,
    setting_key   VARCHAR(64) NOT NULL,
    setting_value TEXT,
    description   TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, setting_key)
);

COMMENT ON TABLE tenant_settings IS '租户级 key-value 配置 (双轨开关 / 主题色 / 等)';

-- 默认 false:学院单轨,跟接入前完全一致。学校信息中心想启用书院制时走 admin UI 切到 true。
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, description)
VALUES ('${tenant_id}', 'enable_residential_track', 'false', '是否启用书院制 (学术 + 生活双轨视图)')
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
