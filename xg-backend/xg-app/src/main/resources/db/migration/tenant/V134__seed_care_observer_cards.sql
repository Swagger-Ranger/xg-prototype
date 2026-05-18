-- 默认「关怀」AI 观察员卡片（配合 schema-catalog 由 student_alert 切到 care_task）。
-- 旧 student_alert 已从 _index.yaml 摘除（A1 硬切），院系领导/学工部部长开箱即看到
-- 基于 care_task 的治理卡，而不是对已废弃旧表生成 SQL。
--
-- owner 绑定 demo 领导账号：dean1=赵院长(2102, role dean)、director1=郑部长(2403,
-- role student_affairs_director)。两者对 care_task 的 role_scope 均为 ""（本校全部，
-- 对齐 CareAdminAccess），故卡片返回全校口径。
--
-- sql_text 用 dollar-quote 避免与外层 SQL 引号冲突；执行前仍由 QueryGuardService
-- 二次校验 + role_scope 注入（这里不写 scope 子句，符合 QueryGuard 约定）。
-- 列均取自 care_task.yaml 白名单；不用 SELECT *、不加 schema 前缀。
-- ID 段 14001-14010（避开 V100 的 12xxx / V131 的 13xxx）。

INSERT INTO ai_observer_card
    (id, tenant_id, owner_id, owner_role, title, nl_query, sql_text, chart_type, sort_order)
VALUES
-- ── dean1 赵院长 (2102, dean) ───────────────────────────────────────────────
(14001, '${tenant_id}', 2102, 'dean', '待处理关怀任务',
 '本院当前还没处置完的主动关怀任务有多少',
 $q$SELECT COUNT(*) AS 待处理关怀 FROM care_task WHERE status IN ('pending','accepted','in_progress','overdue')$q$,
 'statistic', 1),

(14002, '${tenant_id}', 2102, 'dean', '关怀严重度分布',
 '未关闭的关怀任务按严重度分组各有多少',
 $q$SELECT severity AS 严重度, COUNT(*) AS 数量 FROM care_task WHERE status IN ('pending','accepted','in_progress','overdue') GROUP BY severity$q$,
 'pie', 2),

(14003, '${tenant_id}', 2102, 'dean', '超期关怀任务',
 '已经超过处理时限还没办结的关怀任务清单',
 $q$SELECT id AS 任务ID, student_id AS 学生, severity AS 严重度, due_at AS 截止时间 FROM care_task WHERE status = 'overdue' ORDER BY due_at ASC$q$,
 'table', 3),

(14004, '${tenant_id}', 2102, 'dean', '近30天规则命中TOP',
 '最近 30 天各关怀规则各命中了多少次，按次数排序',
 $q$SELECT rule_id AS 规则, COUNT(*) AS 命中数 FROM care_task WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY rule_id ORDER BY COUNT(*) DESC$q$,
 'bar', 4),

(14005, '${tenant_id}', 2102, 'dean', '近30天处置状态分布',
 '最近 30 天产生的关怀任务，当前各处置状态各有多少',
 $q$SELECT status AS 状态, COUNT(*) AS 数量 FROM care_task WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY status$q$,
 'bar', 5),

-- ── director1 郑部长 (2403, student_affairs_director) ───────────────────────
(14006, '${tenant_id}', 2403, 'student_affairs_director', '待处理关怀任务',
 '全校当前还没处置完的主动关怀任务有多少',
 $q$SELECT COUNT(*) AS 待处理关怀 FROM care_task WHERE status IN ('pending','accepted','in_progress','overdue')$q$,
 'statistic', 1),

(14007, '${tenant_id}', 2403, 'student_affairs_director', '关怀严重度分布',
 '未关闭的关怀任务按严重度分组各有多少',
 $q$SELECT severity AS 严重度, COUNT(*) AS 数量 FROM care_task WHERE status IN ('pending','accepted','in_progress','overdue') GROUP BY severity$q$,
 'pie', 2),

(14008, '${tenant_id}', 2403, 'student_affairs_director', '超期关怀任务',
 '已经超过处理时限还没办结的关怀任务清单',
 $q$SELECT id AS 任务ID, student_id AS 学生, severity AS 严重度, due_at AS 截止时间 FROM care_task WHERE status = 'overdue' ORDER BY due_at ASC$q$,
 'table', 3),

(14009, '${tenant_id}', 2403, 'student_affairs_director', '近30天规则命中TOP',
 '最近 30 天各关怀规则各命中了多少次，按次数排序',
 $q$SELECT rule_id AS 规则, COUNT(*) AS 命中数 FROM care_task WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY rule_id ORDER BY COUNT(*) DESC$q$,
 'bar', 4),

(14010, '${tenant_id}', 2403, 'student_affairs_director', '近30天处置状态分布',
 '最近 30 天产生的关怀任务，当前各处置状态各有多少',
 $q$SELECT status AS 状态, COUNT(*) AS 数量 FROM care_task WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY status$q$,
 'bar', 5)
ON CONFLICT (id) DO NOTHING;
