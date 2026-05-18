-- 危机线索命中类别（设计 §3-§4）。detector 本就算出 safety / basic_needs 两类，
-- 此前只回传 rule_version，辅导员看不到「为什么触发」。补一列让区一能展示
-- 「安全危机类（高危表达）」/「基本生存求助」——这是临床分类桶，**不是学生原话**，
-- 不破隐私铁律 §5（原话仍不落库、全系统无处可查）。
--
-- 旧 pending 行 category 为 NULL（前端降级显示「未分类」），新信号才带类别，可接受。

ALTER TABLE crisis_signal ADD COLUMN IF NOT EXISTS category VARCHAR(32);

COMMENT ON COLUMN crisis_signal.category IS '命中类别：safety=安全危机类高危表达 / basic_needs=基本生存求助；临床分类桶，非学生原话（设计 §5）';
