-- 通知中心 P0 — 4 张配置表 + 双轨去重列 + seed
--
-- 现状回顾(不重造):
--   * V006 已建 notification + notification_recipient(投递层)
--   * NotificationService.send + NotificationDispatchService 已就绪
--   * NotificationExecutor 已经从 workflow YAML 节点直接发(轨 1)
--
-- 这层加的是"业务事件 → 模板 + 偏好 → send"的路由层(轨 2):
--   1) notification_template     模板字典(管理员配 / Orchestrator 查)
--   2) notification_preference   渠道偏好(角色 × 模板 → 渠道列表覆盖默认)
--   3) care_rule                 关怀规则(按假别 / 时机匹配,触发关怀通知)
--   4) care_dispatch_log         关怀去重(同 rule + 同业务对象只发 1 次)
--   5) notification.template_code 列 + 双轨去重唯一索引
--
-- 双轨去重逻辑:
--   YAML notification 节点和 Orchestrator 都写 notification.template_code,
--   (source_type, source_id, template_code) 唯一索引保证同业务对象 + 同模板
--   不会重复落两条。Orchestrator 在 send 前 ON CONFLICT DO NOTHING 即可。

-- ─────────── 1. 通知模板字典 ───────────
CREATE TABLE IF NOT EXISTS notification_template (
    id               BIGINT PRIMARY KEY,
    tenant_id        VARCHAR(32) NOT NULL,
    code             VARCHAR(64) NOT NULL,           -- LEAVE_APPROVAL_PENDING / CARE_NEAR_RETURN ...
    category         VARCHAR(16) NOT NULL,           -- business / care / system
    biz_module       VARCHAR(32) NOT NULL,           -- leave / attendance / ...
    title_tmpl       VARCHAR(200) NOT NULL,
    body_tmpl        TEXT NOT NULL,
    default_channels TEXT[] NOT NULL DEFAULT '{in_app}',
    default_level    VARCHAR(16) NOT NULL DEFAULT 'normal', -- normal / important / urgent
    wx_template_id   VARCHAR(64),                     -- 小程序订阅消息模板 ID(微信平台申请的);P0 留空
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    description      VARCHAR(200),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_notif_tmpl_tenant ON notification_template(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_tmpl_module ON notification_template(biz_module);

COMMENT ON TABLE notification_template IS '通知模板字典(管理员可改文案 / 默认渠道,Orchestrator 按 code 路由)';
COMMENT ON COLUMN notification_template.code IS '业务码,如 LEAVE_APPROVED — Orchestrator 用它定位';
COMMENT ON COLUMN notification_template.title_tmpl IS '标题模板,支持 {{var}} 占位';
COMMENT ON COLUMN notification_template.default_channels IS '未配偏好时的默认渠道集合';
COMMENT ON COLUMN notification_template.wx_template_id IS '小程序订阅消息模板 ID;P0 stub 阶段可空';

-- ─────────── 2. 渠道偏好(角色 / 用户级覆盖)───────────
CREATE TABLE IF NOT EXISTS notification_preference (
    id            BIGINT PRIMARY KEY,
    tenant_id     VARCHAR(32) NOT NULL,
    scope_type    VARCHAR(16) NOT NULL,             -- role / user
    scope_value   VARCHAR(64) NOT NULL,             -- role_code(scope=role)/ user_id 字符串(scope=user)
    template_code VARCHAR(64) NOT NULL,
    channels      TEXT[] NOT NULL DEFAULT '{}',     -- 选中的渠道;空数组 = 静默
    muted         BOOLEAN NOT NULL DEFAULT FALSE,   -- 整模板静默(优先级最高,channels 即便有内容也忽略)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, scope_type, scope_value, template_code)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_lookup
    ON notification_preference(tenant_id, scope_type, scope_value, template_code);

COMMENT ON TABLE notification_preference IS '通知渠道偏好(三层覆盖:default_channels < role 级 < user 级)';
COMMENT ON COLUMN notification_preference.scope_value IS 'scope_type=role 时是 role_code;scope_type=user 时是 user_id 字符串';

-- ─────────── 3. 关怀规则 ───────────
CREATE TABLE IF NOT EXISTS care_rule (
    id             BIGINT PRIMARY KEY,
    tenant_id      VARCHAR(32) NOT NULL,
    code           VARCHAR(64) NOT NULL,
    biz_module     VARCHAR(32) NOT NULL,             -- leave (P0 仅做)
    trigger_type   VARCHAR(32) NOT NULL,             -- before_event / after_event / on_event
    trigger_event  VARCHAR(64) NOT NULL,             -- leave_start / leave_end / leave_approved / sick_apply ...
    offset_hours   INT NOT NULL DEFAULT 0,           -- before_event 用负值(-24=提前一天);on_event 为 0
    match_jsonb    JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"leave_type":"personal","destination_city_not_empty":true}
    template_code  VARCHAR(64) NOT NULL,
    data_resolver  VARCHAR(64),                       -- bean 名,如 weatherResolver;空则不调外部
    enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    description    VARCHAR(200),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_care_rule_lookup ON care_rule(tenant_id, biz_module, enabled);

COMMENT ON TABLE care_rule IS '关怀规则:CareScheduler 按 trigger 扫描,match_jsonb 命中即按 template_code 发通知';
COMMENT ON COLUMN care_rule.trigger_event IS '语义事件名,Scheduler 自己解释。leave_start / leave_end 走时间扫描;leave_approved / sick_apply 走 ApplicationEvent';
COMMENT ON COLUMN care_rule.match_jsonb IS '受限 DSL:支持 leave_type 等于、字段非空、status_in 数组等;不暴露脚本';
COMMENT ON COLUMN care_rule.data_resolver IS 'Spring bean 名,实现 CareDataResolver 接口,负责往模板 vars 里塞外部数据(如天气)';

-- ─────────── 4. 关怀分发日志(防重)───────────
CREATE TABLE IF NOT EXISTS care_dispatch_log (
    id              BIGINT PRIMARY KEY,
    tenant_id       VARCHAR(32) NOT NULL,
    rule_code       VARCHAR(64) NOT NULL,
    biz_type        VARCHAR(32) NOT NULL,             -- leave
    biz_id          BIGINT NOT NULL,                  -- leave_request.id
    notification_id BIGINT,                           -- 真发出的通知 id(可能为 NULL — match 命中但 send 失败)
    dispatched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, rule_code, biz_type, biz_id)
);

CREATE INDEX IF NOT EXISTS idx_care_disp_log_lookup ON care_dispatch_log(rule_code, biz_id);

COMMENT ON TABLE care_dispatch_log IS '关怀通知去重表(同 rule + 同业务对象 1 次)';

-- ─────────── 5. notification 加 template_code + 双轨去重索引 ───────────
ALTER TABLE notification ADD COLUMN IF NOT EXISTS template_code VARCHAR(64);

-- 仅当三个字段都非 NULL 时去重(YAML 旧节点没填 template_code 不受影响)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_source_template
    ON notification(source_type, source_id, template_code)
    WHERE source_id IS NOT NULL AND template_code IS NOT NULL;

COMMENT ON COLUMN notification.template_code IS '触发模板码,用于双轨去重(YAML + Orchestrator 同 source 同模板只 1 条)';

-- ─────────── seed ────────────

-- 4 个 leave 业务模板(对应文案讨论时定的 4 个事件)
INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module, title_tmpl, body_tmpl, default_channels, default_level, description)
VALUES
    (8901, '${tenant_id}', 'LEAVE_APPROVAL_PENDING', 'business', 'leave',
     '请假待审批 - {{student_name}}',
     '{{student_name}} 提交了 {{leave_type_name}} 请假申请({{start_date}} 至 {{end_date}}),请尽快审批。',
     '{in_app, miniprogram, wecom}', 'normal',
     '请假申请到达待审批节点,通知审批人'),

    (8902, '${tenant_id}', 'LEAVE_APPROVED', 'business', 'leave',
     '请假申请已通过',
     '您 {{start_date}} 至 {{end_date}} 的 {{leave_type_name}} 请假已通过审批。',
     '{in_app, miniprogram}', 'normal',
     '请假流程通过,通知学生本人'),

    (8903, '${tenant_id}', 'LEAVE_REJECTED', 'business', 'leave',
     '请假申请被驳回',
     '您的 {{leave_type_name}} 请假申请未通过。原因:{{reject_reason}}。',
     '{in_app, miniprogram}', 'important',
     '请假被驳回,通知学生本人'),

    (8904, '${tenant_id}', 'LEAVE_RETURNED', 'business', 'leave',
     '销假完成',
     '您的销假已完成({{return_source_label}}),欢迎回校。',
     '{in_app, miniprogram}', 'normal',
     '销假完成,通知学生 + 班主任')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3 个关怀模板
INSERT INTO notification_template
    (id, tenant_id, code, category, biz_module, title_tmpl, body_tmpl, default_channels, default_level, description)
VALUES
    (8911, '${tenant_id}', 'CARE_PERSONAL_TRAVEL_WEATHER', 'care', 'leave',
     '出行关怀 — {{destination_city}} 天气',
     '同学你好,明天将前往 {{destination_city}}。当地天气:{{weather_desc}},气温 {{weather_temp}}℃,请注意安全和保暖。',
     '{in_app, miniprogram}', 'normal',
     '事假外地行程前 1 天,推送目的地天气'),

    (8912, '${tenant_id}', 'CARE_NEAR_RETURN_REMINDER', 'care', 'leave',
     '即将销假提醒',
     '你的 {{leave_type_name}} 假期明天结束。请按时回校并完成销假;如需续假,请提前提交申请。',
     '{in_app, miniprogram}', 'normal',
     '销假前 1 天,提醒回校 / 续假'),

    (8913, '${tenant_id}', 'CARE_SICK_LEAVE', 'care', 'leave',
     '病假关怀',
     '收到你的病假申请,愿你早日康复。请按医嘱休息,有需要可联系辅导员。',
     '{in_app, miniprogram}', 'normal',
     '病假申请通过时,推送关怀语')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3 条关怀规则 seed
INSERT INTO care_rule
    (id, tenant_id, code, biz_module, trigger_type, trigger_event, offset_hours, match_jsonb, template_code, data_resolver, description)
VALUES
    (8921, '${tenant_id}', 'PERSONAL_TRAVEL_WEATHER', 'leave',
     'before_event', 'leave_start', -24,
     '{"leave_type": "personal", "destination_city_not_empty": true}'::jsonb,
     'CARE_PERSONAL_TRAVEL_WEATHER', 'weatherResolver',
     '事假行程开始前 24 小时,推送目的地天气'),

    (8922, '${tenant_id}', 'NEAR_RETURN_REMINDER', 'leave',
     'before_event', 'leave_end', -24,
     '{"status_in": ["approved"]}'::jsonb,
     'CARE_NEAR_RETURN_REMINDER', NULL,
     '所有假别销假前 24 小时,提醒回校'),

    (8923, '${tenant_id}', 'SICK_LEAVE_CARE', 'leave',
     'on_event', 'leave_approved', 0,
     '{"leave_type": "sick"}'::jsonb,
     'CARE_SICK_LEAVE', NULL,
     '病假审批通过时,即时推送关怀语')
ON CONFLICT (tenant_id, code) DO NOTHING;
