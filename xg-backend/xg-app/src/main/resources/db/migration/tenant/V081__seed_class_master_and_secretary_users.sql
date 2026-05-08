-- 补 demo 用户：班主任 + 院系书记 + 学工部部长
--
-- V075 创建了 class_master / college_secretary / student_affairs_director 三
-- 个角色，但明确没挂用户（"demo seed 走独立迁移更清晰"）。导致：
--   - 默认请假配置事假 0-2 天档需要班主任，没挂人 → HealthCard 报错
--     "审批链卡死：缺审批人"。
--   - 病假 / 婚假 / 实习等档需要院系书记，同样卡。
--
-- 本迁移只做 demo seed：
--   1) 新增 3 个用户（id 2401-2403，避开 V038 之后的学生 id 区间）+ 挂角色。
--   2) 给 V021 的 1002 软件 2301 班补 leader_id。
--      LeaveConfigHealthService.checkChainRoleUndefined("class_master") 走的
--      是 org_unit.leader_id 字段而不是 sys_user_role，所以这一步是必须的。
--
-- 密码沿用 V022 的 BCrypt(xg@123456)，老师 demo 一键登录。
-- Idempotent：所有 INSERT 都带 ON CONFLICT；UPDATE 限定 leader_id IS NULL
-- 避免覆盖人工指定的班主任。

-- 1) Demo 用户
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash)
VALUES
    (2401, '${tenant_id}', 'master1',    '孙班主任', 'female', '13800000006', 'master@demo.edu',    'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2402, '${tenant_id}', 'secretary1', '吴书记',   'male',   '13800000007', 'secretary@demo.edu', 'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
    (2403, '${tenant_id}', 'director1',  '郑部长',   'male',   '13800000008', 'director@demo.edu',  'active', '$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT (id) DO NOTHING;

-- 2) 挂角色（role_id from V075: 10=class_master, 11=college_secretary, 12=student_affairs_director）
INSERT INTO sys_user_role (user_id, role_id) VALUES
    (2401, 10),
    (2402, 11),
    (2403, 12)
ON CONFLICT DO NOTHING;

-- 3) 软件 2301 班的班主任落到 org_unit.leader_id（V021 创建的 id=1002 班）
UPDATE org_unit
   SET leader_id = 2401,
       updated_at = NOW()
 WHERE id = 1002
   AND type = 'class'
   AND leader_id IS NULL;
