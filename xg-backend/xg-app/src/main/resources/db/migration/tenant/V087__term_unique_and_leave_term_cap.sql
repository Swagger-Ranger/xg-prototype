-- 学期 + 学期累计请假上限两件事一起做(语义关联,一起回退)。
--
-- 1) academic_term 的 is_current 防并发:partial unique index 兜底,确保每
--    租户同一时刻只能有一条 is_current=true。AcademicTermService.setCurrent
--    虽然在事务里先清后设,但两个 admin 并发 setCurrent 不同 term 时仍可能
--    各自看不到对方写入,产出双 current。这条索引是最后一道闸。
--
-- 2) leave_type_config 加 term_max_days:学期累计上限,NULL = 不限。跟
--    现有 max_days(单次上限)语义不同——
--      max_days       = 一次请假天数上限(防一次请太多)
--      term_max_days  = 本学期累计上限(防同一假别反复短请凑长)
--    两个都参与 LeaveService.applyLeave 校验。

-- ---------------------- 1) is_current 唯一约束 ----------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_term_current_per_tenant
    ON academic_term (tenant_id)
    WHERE is_current = true;

-- ---------------------- 2) leave_type_config 加学期累计字段 ----------------------
ALTER TABLE leave_type_config
    ADD COLUMN IF NOT EXISTS term_max_days NUMERIC(5,1);

COMMENT ON COLUMN leave_type_config.term_max_days IS
    '本学期累计请假上限(天数,可半天)。NULL=不限。学期边界由 academic_term.is_current 决定。';
