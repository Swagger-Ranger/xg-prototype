-- Academic term (学期) — feeds 学期进度环、当前周次、距期末考天数 等定位类
-- 视觉，且课表 / 学历事件都按 term_code 关联到这里。
CREATE TABLE IF NOT EXISTS academic_term (
    id           BIGINT PRIMARY KEY,
    tenant_id    VARCHAR(32) NOT NULL,
    code         VARCHAR(32) NOT NULL,        -- "2025-2026-1"
    name         TEXT        NOT NULL,        -- "2025-2026 学年第一学期"
    start_date   DATE        NOT NULL,        -- 开学日期
    end_date     DATE        NOT NULL,        -- 学期结束（含期末考结束）
    total_weeks  SMALLINT    NOT NULL,        -- 总教学周
    is_current   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

-- One "current" term per tenant (queries: WHERE is_current = TRUE 直接命中).
CREATE UNIQUE INDEX uniq_academic_term_current
    ON academic_term(tenant_id) WHERE is_current = TRUE;

COMMENT ON TABLE academic_term IS '学期表 (校园页学期进度 / 课表 / 考试事件依赖)';
