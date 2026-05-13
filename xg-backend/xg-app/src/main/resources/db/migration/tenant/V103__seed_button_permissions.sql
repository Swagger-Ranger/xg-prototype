-- 补齐 25 个细粒度按钮 / 功能权限。仅注册到 sys_permission，
-- 默认授予在代码 RolePermissionDefaults.java 里维护（不再写 sys_role_permission）。
-- 现有 35 个 code 不动；新增带模块 + 中文名 + type（menu / button / data）。

INSERT INTO sys_permission (id, tenant_id, code, name, module, type, is_builtin)
VALUES
    -- system 100 段
    (106,  '${tenant_id}', 'system:ai:metrics',                 'AI 用量统计',     'system',    'menu',   TRUE),
    (107,  '${tenant_id}', 'system:field:manage',               '字段字典管理',     'system',    'menu',   TRUE),

    -- leave 200 段
    (206,  '${tenant_id}', 'leave:return:manual',               '手工销假审核',     'leave',     'button', TRUE),
    (207,  '${tenant_id}', 'leave:config',                      '请假规则配置',     'leave',     'menu',   TRUE),

    -- collection 300 段
    (303,  '${tenant_id}', 'collection:export',                 '导出收集结果',     'collection','button', TRUE),

    -- checkin 400 段
    (403,  '${tenant_id}', 'checkin:export',                    '导出签到记录',     'checkin',   'button', TRUE),

    -- worklog 700 段
    (702,  '${tenant_id}', 'worklog:write',                     '撰写工作日志',     'worklog',   'button', TRUE),
    (703,  '${tenant_id}', 'worklog:export',                    '导出工作日志',     'worklog',   'button', TRUE),

    -- workstudy 900 段
    (921,  '${tenant_id}', 'workstudy:application:decide',      '岗位申请决策',     'workstudy', 'button', TRUE),
    (922,  '${tenant_id}', 'workstudy:timesheet:report',        '工时上报',         'workstudy', 'button', TRUE),
    (923,  '${tenant_id}', 'workstudy:timesheet:finalize',      '工时定稿',         'workstudy', 'button', TRUE),
    (924,  '${tenant_id}', 'workstudy:salary:submit',           '薪资提交',         'workstudy', 'button', TRUE),
    (925,  '${tenant_id}', 'workstudy:yearsetting:manage',      '学年配置',         'workstudy', 'menu',   TRUE),

    -- discipline 1000 段（discipline:manage 已存）
    (1002, '${tenant_id}', 'discipline:create',                 '录入违纪',         'discipline','button', TRUE),
    (1003, '${tenant_id}', 'discipline:approve',                '审批违纪/处分',    'discipline','button', TRUE),
    (1004, '${tenant_id}', 'discipline:appeal',                 '违纪申诉',         'discipline','button', TRUE),
    (1005, '${tenant_id}', 'discipline:export',                 '导出违纪记录',     'discipline','button', TRUE),

    -- ai 1100 段（1103 = ai:assistant:use 已存）
    (1104, '${tenant_id}', 'ai:observer:manage',                'AI 观察员卡片',    'ai',        'menu',   TRUE),

    -- alert 1200 段（新建）
    (1201, '${tenant_id}', 'alert:view',                        '查看异常预警',     'alert',     'menu',   TRUE),
    (1202, '${tenant_id}', 'alert:handle',                      '处理预警',         'alert',     'button', TRUE),
    (1203, '${tenant_id}', 'alert:scan',                        '手动触发扫描',     'alert',     'button', TRUE),
    (1204, '${tenant_id}', 'alert:rule:manage',                 '预警规则管理',     'alert',     'menu',   TRUE),

    -- talk 1300 段（新建）
    (1301, '${tenant_id}', 'talk:record',                       '记录谈话',         'talk',      'button', TRUE),
    (1302, '${tenant_id}', 'talk:manage',                       '谈话记录管理',     'talk',      'menu',   TRUE),

    -- academic 1400 段（新建）
    (1401, '${tenant_id}', 'academic:manage',                   '学期/校历/课表管理','academic', 'menu',   TRUE)
ON CONFLICT (id) DO NOTHING;
