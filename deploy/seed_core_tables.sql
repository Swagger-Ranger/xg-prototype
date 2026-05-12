-- 核心表初始化（仅演示登录需要的最小表集）
SET search_path TO tenant_default, public;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id BIGINT PRIMARY KEY, tenant_id VARCHAR(32) NOT NULL, username VARCHAR(64) NOT NULL,
    password_hash TEXT, real_name TEXT NOT NULL, gender VARCHAR(8), phone TEXT, email TEXT,
    avatar_url TEXT, external_id TEXT, wechat_openid TEXT, wecom_userid TEXT,
    status VARCHAR(16) DEFAULT 'active', privacy_agreed BOOLEAN DEFAULT FALSE,
    privacy_agreed_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
    created_by BIGINT, updated_by BIGINT, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(), deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, username)
);

-- 2. 角色表
CREATE TABLE IF NOT EXISTS sys_role (
    id BIGINT PRIMARY KEY, tenant_id VARCHAR(32) NOT NULL, code VARCHAR(64) NOT NULL,
    name TEXT NOT NULL, description TEXT, is_builtin BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0, UNIQUE(tenant_id, code)
);

-- 3. 用户角色关联
CREATE TABLE IF NOT EXISTS sys_user_role (
    user_id BIGINT NOT NULL, role_id BIGINT NOT NULL, org_id BIGINT,
    PRIMARY KEY (user_id, role_id)
);

-- 4. 插入角色
INSERT INTO sys_role VALUES
(1,'default','student','学生','在校学生',TRUE,1),
(2,'default','counselor','辅导员','辅导员/班主任',TRUE,2),
(3,'default','college_admin','院系管理员','院系级管理人员',TRUE,3),
(4,'default','dean','院系领导','院长/副院长',TRUE,4),
(5,'default','student_affairs_officer','学工处人员','学生工作处人员',TRUE,5),
(6,'default','school_admin','校级管理员','校级系统管理员',TRUE,6)
ON CONFLICT DO NOTHING;

-- 5. 插入演示用户（密码 xg@123456）
INSERT INTO sys_user (id, tenant_id, username, real_name, gender, phone, email, status, password_hash) VALUES
(2011,'default','stu_zhang','张晓明','male','13900000011','zhang@demo.edu','active','$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
(2012,'default','stu_wang','王丽华','female','13900000012','wang@demo.edu','active','$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
(2001,'default','counselor_li','李老师','female','13800000001','li@demo.edu','active','$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy'),
(2102,'default','dean1','赵院长','male','13800000003','dean@demo.edu','active','$2b$10$Od5x/pGbC/81UXHxV8kOiOlJRhHvWujXqQTr103U/dAk6drchrwKy')
ON CONFLICT DO NOTHING;

-- 6. 绑定角色
INSERT INTO sys_user_role VALUES (2011,1,NULL),(2012,1,NULL),(2001,2,NULL),(2102,4,NULL) ON CONFLICT DO NOTHING;

-- 验证
SELECT 'users' as item, count(*) FROM sys_user
UNION ALL SELECT 'roles', count(*) FROM sys_role
UNION ALL SELECT 'bindings', count(*) FROM sys_user_role;
