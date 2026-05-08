-- Academic event (考试 / 假期 / 其它学历事件) — 给校园页"距期末考 X 天"
-- 等倒计时和欢迎条副标题用。粒度 'month' 时 start/end 用月初/月末，UI
-- 显示"6 月（具体日期待定）"；后续粒度细化到 'day' 直接覆盖 start/end 即可。
CREATE TABLE IF NOT EXISTS academic_event (
    id           BIGINT PRIMARY KEY,
    tenant_id    VARCHAR(32) NOT NULL,
    term_code    VARCHAR(32),               -- 关联学期 code; 寒暑假可空
    event_type   VARCHAR(32) NOT NULL,      -- 'exam_midterm' / 'exam_final' / 'holiday' / 'other'
    name         TEXT        NOT NULL,      -- "期末考试" / "寒假" / "国庆"
    start_date   DATE        NOT NULL,
    end_date     DATE        NOT NULL,
    granularity  VARCHAR(8)  NOT NULL DEFAULT 'day',  -- 'day' / 'month'
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    CHECK (granularity IN ('day', 'month')),
    CHECK (start_date <= end_date)
);

CREATE INDEX idx_academic_event_term ON academic_event(tenant_id, term_code);
CREATE INDEX idx_academic_event_dates ON academic_event(tenant_id, start_date, end_date);

COMMENT ON TABLE academic_event IS '学历事件: 考试 / 假期 等时间节点';
COMMENT ON COLUMN academic_event.granularity IS '日期粒度: month=粗到月（前端显示"X月"）, day=精确';
