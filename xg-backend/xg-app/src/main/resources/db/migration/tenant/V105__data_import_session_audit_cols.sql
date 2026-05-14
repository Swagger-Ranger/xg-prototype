-- V104 漏写了 BaseEntity 期望的 created_by / updated_by 两列。
-- MyBatis-Plus 的 insert 走 NOT_NULL strategy，会跳过 null 字段不进 SQL,所以 INSERT 没炸;
-- 但 selectById 会拼出 SELECT 全字段, 命中 PG "column does not exist" 报 500。

ALTER TABLE data_import_session
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS updated_by BIGINT;
