-- 给 workflow_definition 加 change_summary,记录每次 apply 的中文摘要(LLM 给的 ≤30 字)。
-- 配置历史 / 版本回滚 UI 展示时间轴时需要这一列,否则只能看 version + 时间,没法快速识别。
ALTER TABLE workflow_definition
    ADD COLUMN IF NOT EXISTS change_summary VARCHAR(200);

COMMENT ON COLUMN workflow_definition.change_summary IS
    '本次发布的中文改动摘要(≤200 字),用于历史版本展示;为空表示首版/未填写。';
