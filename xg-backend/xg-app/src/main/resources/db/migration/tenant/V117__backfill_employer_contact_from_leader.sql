-- 历史 employer 行的 contact_name / contact_phone / email 可能为空 —
-- V052 建表后早期版本 admin 是手填这几个字段;后来 EmployersTab 改成「自动跟随
-- leader_user_id 落库」,但已经写入的旧行不会回填,而前端列表又移除了对
-- /system/users (sys_user 反查) 的依赖,改成直接读 contact_*。
--
-- 这条迁移把所有 contact_name 为空的存量 employer 用其 leader_user_id 对应的
-- sys_user 档案信息补齐。COALESCE 保护已有非空值不被覆盖。

UPDATE employer e
SET    contact_name  = su.real_name,
       contact_phone = COALESCE(e.contact_phone, su.phone),
       email         = COALESCE(e.email, su.email)
FROM   sys_user su
WHERE  su.id = e.leader_user_id
  AND  e.contact_name IS NULL
  AND  e.deleted_at IS NULL;
