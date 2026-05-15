-- V110/V111 把硬编码的 demo 申请(id 4205/4206,position 4101/4102,student 2015/2011)
-- 写进每个租户 schema,但只有 demo 租户能真实匹配上这些 student / position id。
-- 真实学校租户里这俩 row 变成"挂在并不存在的岗位上的孤儿申请",
-- 跨学院 PII 视图、统计、AI Tool 都可能扫到这种异常数据。
--
-- 修复:删孤儿 demo 申请(position_id 在本租户 work_study_position 表里查不到的)。
--
-- Idempotent:
--   * demo 租户(position 4101/4102 真实存在) → DELETE 不命中,保留 demo
--   * 真实租户(position 不存在)              → DELETE 4205/4206
--   * 重跑无害
--
-- 长远修:V110/V111 不该出现在生产 migration 里;后续按 Flyway profile / 单独 dev seed 重构。

DELETE FROM work_study_application a
 WHERE a.id IN (4205, 4206)
   AND a.tenant_id = '${tenant_id}'
   AND NOT EXISTS (
       SELECT 1 FROM work_study_position p
        WHERE p.id = a.position_id
          AND p.tenant_id = a.tenant_id
   );
