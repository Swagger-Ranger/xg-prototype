-- 销假改造 P0:
--   1) 默认链路改为「学生小程序 GPS 上报 → 校园围栏命中即销」,不再走 workflow
--   2) 异常通道:GPS 不命中,学生可申请人工销假,辅导员审一下;这是单节点 yes/no
--      状态字段流转,不复用 workflow 引擎
--   3) 后续接入门禁系统(P1)再补 access_card 闭环
--
-- 本迁移做三件事:
--   A) leave_request 加 4 个字段:return_source / manual_return_* 系列
--   B) workflow_definition: biz_type='leave_return' 的 published 全置 disabled
--      (老的 cancel_pending 数据保留继续走完老流程,见 ⑤ 决策)
--   C) public.tenant.config 已有 jsonb,围栏配置存里面,无需建新表
--
-- 不做的事:
--   - 不删 leave_return 行(留作历史)
--   - 不动当前 cancel_pending 状态的 leave_request

-- ---------------------- A) leave_request 字段 ----------------------
ALTER TABLE leave_request
    ADD COLUMN IF NOT EXISTS return_source             VARCHAR(32),
    ADD COLUMN IF NOT EXISTS manual_return_reason      TEXT,
    ADD COLUMN IF NOT EXISTS manual_return_attachments JSONB,
    ADD COLUMN IF NOT EXISTS manual_return_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN leave_request.return_source IS
    '销假来源:gps / manual_approve / manual_force / access_card';
COMMENT ON COLUMN leave_request.manual_return_reason IS
    '学生申请人工销假时填写的理由(GPS 不在校园内时的兜底通道)';
COMMENT ON COLUMN leave_request.manual_return_attachments IS
    '学生申请人工销假上传的附件(车票 / 归校证明 / 行程截图等),JSON 数组';

-- ---------------------- B) Disable leave_return workflow ----------------------
UPDATE workflow_definition
   SET status = 'disabled',
       updated_at = NOW()
 WHERE biz_type = 'leave_return'
   AND status = 'published';
