-- 在 leave_global_config 上增加「请假需提供证明材料」全局开关。
-- 行为预期:开 = 学生提交请假表单时必须上传证明文件;关 = 不强制(默认)。
-- 只是配置位,前端开关绑这一列;实际"强制"行为由 LeaveApplyModal 表单层接入(后续迭代)。
ALTER TABLE leave_global_config
    ADD COLUMN IF NOT EXISTS require_proof BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leave_global_config.require_proof IS
    '是否要求学生请假时提交证明材料。FALSE=不强制(默认);TRUE=强制必传。';
