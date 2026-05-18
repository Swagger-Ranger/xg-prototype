-- 把 V110 加的 4205 (rejected) + 4206 (offboarded) 两条 demo 申请挪到
-- 张晓明 (stu_zhang, 2011) 名下 — 因为登录页快捷入口没有 stu_zhao。
-- 这样张晓明账号一次能看到 rejected + offboarded + on_duty 三种进展形态。
--
-- 注意：work_study_application 没有 (student_id, position_id) 唯一约束，
-- 4201 (hired+on_duty on 4101) 与 4205 (rejected on 4101) 可并存。

UPDATE work_study_application
   SET student_id   = 2011,
       student_name = '张晓明'
 WHERE id IN (4205, 4206)
   AND student_id  = 2015;
