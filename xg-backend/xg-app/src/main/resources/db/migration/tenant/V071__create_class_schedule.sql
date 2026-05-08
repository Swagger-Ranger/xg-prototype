-- Class schedule (班级课表) — JSONB entries 而非规范化每节课一行：
--  · 接口同步过来的就是整张表的 JSON 结构，整体替换语义清晰
--  · 查询都是"这个班这学期整张表"，没"找张老师全部课"那种横切需求
--  · 真要按教师切片再开规范化版本
CREATE TABLE IF NOT EXISTS class_schedule (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    class_id        BIGINT      NOT NULL REFERENCES org_unit(id),
    term_code       VARCHAR(32) NOT NULL,
    source          VARCHAR(32),               -- 'manual' / 'edu_admin_sync' / 'imported_xxx'
    last_synced_at  TIMESTAMPTZ,               -- daily sync 写入；NULL=从未同步
    imported_by     BIGINT,
    -- entries 是 [{course_name, teacher, location, day_of_week, start_period,
    --              end_period, weeks: [int...], color}, ...]
    entries         JSONB       NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, class_id, term_code)
);

CREATE INDEX idx_class_schedule_class_term ON class_schedule(class_id, term_code);
CREATE INDEX idx_class_schedule_synced ON class_schedule(last_synced_at);

COMMENT ON TABLE class_schedule IS '班级课表 (按 班级 × 学期 唯一)';
COMMENT ON COLUMN class_schedule.entries IS 'JSONB 课表条目数组';
COMMENT ON COLUMN class_schedule.last_synced_at IS '最近一次同步时间; ClassScheduleSyncScheduler 每日 03:00 更新';
