-- Leave type configuration (dictionary table)
CREATE TABLE IF NOT EXISTS leave_type_config (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    code            VARCHAR(32) NOT NULL,         -- sick_on_campus, sick_off_campus, personal, weekend, official
    name            TEXT NOT NULL,                 -- 病假（在校）, 病假（离校）, 事假, 周末离校, 公假
    parent_code     VARCHAR(32),                  -- parent category (e.g., "sick" for both sick types)
    extra_fields    JSONB NOT NULL DEFAULT '[]',  -- dynamic form fields specific to this leave type
    require_attachment BOOLEAN NOT NULL DEFAULT FALSE,
    max_days        INT,                          -- max days allowed (NULL = no limit)
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT DEFAULT 0,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(tenant_id, code)
);

-- Leave request
CREATE TABLE IF NOT EXISTS leave_request (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    student_id      BIGINT NOT NULL,              -- sys_user.id of the student
    student_name    TEXT NOT NULL,                 -- denormalized for display
    leave_type_code VARCHAR(32) NOT NULL,
    leave_type_name TEXT NOT NULL,                 -- denormalized
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    duration_days   DECIMAL(5,1) NOT NULL,         -- calculated via duration_days()
    reason          TEXT NOT NULL,
    form_data       JSONB DEFAULT '{}',            -- extra fields data
    attachments     JSONB DEFAULT '[]',            -- [{file_id, file_name, file_url}]
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- draft/pending/approved/rejected/cancelled/cancel_pending
    workflow_instance_id BIGINT,
    submitted_by    BIGINT NOT NULL,               -- who submitted (may differ from student_id for proxy submit)
    is_proxy        BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_time     TIMESTAMPTZ,                   -- actual cancel (销假) time
    cancelled_by    BIGINT,                        -- who cancelled (student self or counselor)
    ai_draft        JSONB,                         -- AI pre-fill data for comparison
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_leave_tenant ON leave_request(tenant_id);
CREATE INDEX idx_leave_student ON leave_request(student_id);
CREATE INDEX idx_leave_status ON leave_request(status);
CREATE INDEX idx_leave_time ON leave_request(start_time, end_time);
CREATE INDEX idx_leave_type ON leave_request(leave_type_code);

-- Seed default leave types
INSERT INTO leave_type_config (id, tenant_id, code, name, parent_code, extra_fields, require_attachment, sort_order)
VALUES
    (1, '${tenant_id}', 'sick_on_campus', '病假（在校）', 'sick',
     '[{"field_key":"hospital_cert","field_label":"校医院证明","field_type":"file","required":true}]'::jsonb,
     TRUE, 1),
    (2, '${tenant_id}', 'sick_off_campus', '病假（离校）', 'sick',
     '[{"field_key":"hospital_cert","field_label":"校医院证明","field_type":"file","required":true},{"field_key":"destination","field_label":"离校去向","field_type":"text","required":true},{"field_key":"emergency_contact","field_label":"紧急联系人","field_type":"text","required":true}]'::jsonb,
     TRUE, 2),
    (3, '${tenant_id}', 'personal', '事假', NULL,
     '[{"field_key":"reason_category","field_label":"事由分类","field_type":"select","required":true,"options":["家庭事务","个人事务","其他"]},{"field_key":"evidence","field_label":"证明材料","field_type":"file","required":true}]'::jsonb,
     TRUE, 3),
    (4, '${tenant_id}', 'weekend', '周末离校', NULL,
     '[{"field_key":"leave_date","field_label":"离校时间","field_type":"select","required":true,"options":["周五","周六"]},{"field_key":"return_date","field_label":"返校时间","field_type":"date","required":true},{"field_key":"destination","field_label":"去向","field_type":"text","required":true},{"field_key":"transport","field_label":"交通方式","field_type":"select","required":false,"options":["公共交通","私家车","步行","其他"]}]'::jsonb,
     FALSE, 4),
    (5, '${tenant_id}', 'official', '公假', NULL,
     '[{"field_key":"activity_name","field_label":"活动名称","field_type":"text","required":true},{"field_key":"organizer","field_label":"组织方","field_type":"text","required":true}]'::jsonb,
     FALSE, 5)
ON CONFLICT (tenant_id, code) DO NOTHING;

COMMENT ON TABLE leave_type_config IS '假别配置字典表';
COMMENT ON TABLE leave_request IS '请假申请记录';
