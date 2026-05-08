-- 清掉跟 V087 创建的 uq_academic_term_current_per_tenant 完全等价的旧索引,
-- 防止 \d 输出里两条重复 UNIQUE 让人误以为有两套约束。两者定义完全一致:
--   UNIQUE btree (tenant_id) WHERE is_current = true
-- 留 V087 起的 uq_academic_term_current_per_tenant 作为权威。

DROP INDEX IF EXISTS uniq_academic_term_current;
