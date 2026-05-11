# 朝夕（XG1）产品需求文档（PRD）

> 版本：基于 main 分支代码勘察撰写（2026-05-10）
> 适用对象：后端 / 前端 / AI / 测试 / 运维 / 产品 / 实施
> 编写依据：`xg-backend` / `xg-ai` / `xg-frontend` 实际代码 + Flyway 迁移 99 个 + 配置文件

---

## 0. 文档说明

本 PRD 通过直接审阅代码与 SQL 迁移文件得出，描述系统**当前已实现**的能力边界与**字段级**契约。所有路径、字段、状态机、枚举值均与代码一致，未经过对齐设计文档的"改写润色"。

| 子项目 | 物理路径 | 文件量 | 角色 |
|---|---|---|---|
| `xg-backend` | `/Users/yx/xg1/xg-backend` | 200+ Java 文件，99 张租户迁移 | 业务主服务（Java 17 + Spring Boot 3.x）|
| `xg-ai` | `/Users/yx/xg1/xg-ai` | ~50 Python 文件 | AI 边车（FastAPI 3.11）|
| `xg-frontend` | `/Users/yx/xg1/xg-frontend` | pnpm + turbo monorepo | Web（React 18 + Antd 5）+ 小程序（Taro 3）+ 共享层 |

---

## 1. 产品定位

### 1.1 一句话定义
**朝夕**是面向高校的"AI 原生学生工作服务平台"，覆盖请销假、考勤、勤工助学、违纪处分、学生画像、辅导员谈心、数据采集、通知中心、异常预警、AI 工作台洞察等 13+ 模块，多租户 SaaS（PostgreSQL Schema 级隔离）形态交付。

### 1.2 品牌资产
- **产品名**：朝夕（小程序 navigationBarTitleText 为"朝夕"）
- **AI 助手**：小夕（XiaoxiAvatar 组件位于 `apps/web/src/components/brand/`）
- **Logo 主色**：晨橙 `#fb923c` → 暮紫 `#4c1d95` 锥形渐变（`ZhaoxiLogo.tsx`）
- **管理端主色**：靛蓝 `#6366f1`（`packages/design-tokens/src/tokens.ts`）
- **状态色**：成功 `#059669`、警告 `#b45309`、危险 `#dc2626`

### 1.3 用户群
| 角色码（核心 6 + 老别名 8） | 默认能力域 | 入口形态 |
|---|---|---|
| `student` | 自助：请销假 / 扫码考勤 / 表单填报 / 工助申请 / 知识问答 / AI 助手 | 小程序为主，Web 受限 |
| `teacher` | 审批 / 学生信息 / 通知 / 工作日志（合并旧 `counselor` / `class_master` / `class_monitor`）| Web 为主，小程序辅助 |
| `college_admin` | 院级请假统计 / 处分管理 / 工助岗位审核 / 学生管理（合并旧 `dean` / `college_secretary`）| Web 管理端 |
| `school_admin` | 全校配置：租户设置 / 角色权限 / 组织 / 审计 / 知识库（合并旧 `student_affairs_*` / `aid_center_officer`）| Web 管理端 |
| `super_admin` | 通配权限 `*` | Web 管理端 |
| `employer` | 仅勤工助学（外部用工单位） | Web 管理端，路径白名单 `/work-study` `/profile` |

> 老别名 `counselor` / `class_master` / `class_monitor` / `dean` 等仍在 leave_v3 工作流 YAML 中作为 assignee.role 使用，不能直接删除（见 `RolePermissionDefaults.java`）。

---

## 2. 总体架构

### 2.1 物理拓扑
```
┌────────────────────────────────────────────────────────┐
│  入口层                                                 │
│   ├─ Web 管理端 (Vite / React 18 / AntD 5)             │
│   ├─ 微信小程序 (Taro 3 / 自定义 tabBar)                 │
│   └─ 企业微信 / Web Hook（设计预留）                      │
├────────────────────────────────────────────────────────┤
│  应用层                                                 │
│   ├─ xg-backend  Java 17 + Spring Boot 3.x  :8080      │
│   │   ├─ xg-app          启动 + Flyway                  │
│   │   ├─ xg-platform     auth / workflow / alert /      │
│   │   │                  insight / notification / file /│
│   │   │                  knowledge / system / tenant     │
│   │   ├─ xg-business     leave / checkin / collection / │
│   │   │                  student / violation /           │
│   │   │                  workstudy / worklog / org / ... │
│   │   ├─ xg-common       BaseEntity / TenantContext /   │
│   │   │                  JsonbTypeHandler / R<T>         │
│   │   └─ xg-tool-registry（占位）                          │
│   └─ xg-ai       Python 3.11 + FastAPI       :8000     │
│       ├─ /api/v1/chat            主 Agent                │
│       ├─ /api/v1/insights        工作台洞察              │
│       ├─ /api/v1/agent/invoke    DSL 作者 Agent         │
│       ├─ /api/v1/kb/*            知识库管理              │
│       ├─ /api/v1/transcribe      讯飞 lfasr v2 长录音    │
│       └─ /api/v1/tools/{name}    工具代理                │
├────────────────────────────────────────────────────────┤
│  数据层                                                 │
│   ├─ PostgreSQL 15 + pgvector + pg_trgm                │
│   │   ├─ public schema     : tenant / platform_admin /  │
│   │   │                      knowledge_base / kb_*       │
│   │   │                      platform_audit_log         │
│   │   └─ tenant_<code>     : 租户内全部业务（99 个版本） │
│   ├─ Redis 7              : Sa-Token JWT / 限流 / 缓存  │
│   └─ MinIO                : 文件附件（10MB / 文件）     │
├────────────────────────────────────────────────────────┤
│  外部依赖                                               │
│   ├─ 通义千问 (Qwen)      : 嵌入向量 (512 维)            │
│   ├─ DeepSeek             : 主对话 LLM                  │
│   ├─ Anthropic（可选）     : 通过 ZenMux 网关            │
│   ├─ 讯飞 lfasr v2        : 长录音转写                   │
│   └─ 微信开放平台          : 小程序登录 / 订阅消息        │
└────────────────────────────────────────────────────────┘
```

### 2.2 技术栈关键约束（编码红线）
- **租户隔离**：`TenantContext` ThreadLocal + MyBatis-Plus 拦截器自动追加 `tenant_id`；Schema 名 = `tenant_<code>`，由 `TenantMigrationRunner` 应用迁移。
- **JSONB 字段**：`JsonbTypeHandler`（不是 `JacksonTypeHandler`，否则写出 varchar 被 PG15 拒）。
- **异步 / 调度**：必须显式 `TenantContext.set(tenantId)` 然后 `clear`，否则租户上下文丢失。
- **统一响应**：`R<T>` 包装 + `PageResult<T>` 分页（`xg-common`）。
- **业务异常**：`BizException`（语义码）+ `GlobalExceptionHandler` 统一兜底。
- **日志**：`/private/tmp/xg_app.log`。
- **路由陷阱**：新端点不挂 `/api/v1/students/`（被 `{id}` 吞成 `NumberFormatException`）。
- **Schema 迁移**：`xg-app/src/main/resources/db/migration/{public,tenant}/`，最高已到 V099。
- **devtools 未装**：改 Controller 必须重启 `bootRun`。

### 2.3 单机部署形态
单台 8 核 16G 即可（标准全栈 ~7.5GB 内存）：
- `lite` profile：~3.5GB，开发演示
- `full` profile：含 Prometheus / Grafana / Nginx，生产可用
- 文件：`deploy/docker-compose.yml`

---

## 3. 多租户与权限模型

### 3.1 租户表（public.tenant）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | varchar(32) PK | 租户 ID |
| `code` | varchar(64) UNIQUE | 租户简码（决定 Schema 名）|
| `schema_name` | varchar(64) UNIQUE | `tenant_<code>` |
| `status` | active / suspended / archived | |
| `config` | jsonb | SSO / 功能开关 |
| `max_users` | int | 默认 10000 |
| `expired_at` | timestamptz | 服务到期 |
| `school_city` | （V006 新增）| 学校所在城市，影响天气 / 节假日 |

### 3.2 RBAC 五张表（每租户）
- `sys_user`：账号 / 密码（BCrypt） / 真实姓名 / 手机 / 邮箱 / 头像 / 性别 / `org_id`（所属组织）
- `sys_role`：核心 6 + 老别名 8 = 14 个角色码（`is_builtin=true` 不能删）
- `sys_permission`：35 个权限码 + module 分类（`leave` / `checkin` / `student` / `notification` / `system` / `workstudy` / `discipline` / `knowledge` / `ai`）
- `sys_role_permission`：仅存**override（差异）**，默认权限来自代码 `RolePermissionDefaults.java`
- `sys_user_role`：用户角色绑定，可携带 `org_id` 限定生效范围
- `counselor_org_mapping`：辅导员-班级多对多

### 3.3 默认权限矩阵（代码 hardcode）
| 角色 | 权限码 |
|---|---|
| `student` | leave:submit / checkin:scan / collection:fill / knowledge:ask / ai:assistant:use / student:view / workstudy:apply / workstudy:position:view / workstudy:position:apply / workstudy:salary:view |
| `teacher` | leave:approve / leave:proxy_submit / leave:stats / leave:manage / checkin:manage / collection:manage / notification:send / notification:manage / student:view / student:manage / worklog:manage / ai:assistant:use / knowledge:ask |
| `college_admin` | 继承 teacher + leave:stats / discipline:manage / workstudy:manage / workstudy:position:setup / workstudy:position:manage / workstudy:position:approve / workstudy:salary:view / student:manage / notification:manage |
| `school_admin` | 继承 college_admin + system:manage / system:user:manage / system:org:manage / system:role:manage / system:audit:view / student:sensitive / knowledge:manage / workstudy:employer:manage / workstudy:position:setup_approve / workstudy:salary:process |
| `super_admin` | `*` 通配 |
| `employer` | workstudy:position:setup / workstudy:position:approve / workstudy:position:manage / workstudy:salary:process |

### 3.4 认证
- **登录**：`POST /api/v1/auth/login`（账号密码）/ 微信小程序 OAuth（`pages/login/index`）
- **Token**：Sa-Token JWT，存 Redis；`SaTokenConfig` 配置；`StpInterfaceImpl` 注入用户权限
- **当前用户**：`CurrentUser`（platform/auth）注入到 Service 层
- **退出登录**：`POST /api/v1/auth/logout`（前端 `auth.ts` 的 `clearAuth`）
- **Employer 路径白名单**：前端 `App.tsx` 的 `EMPLOYER_ALLOWED_PREFIXES = ['/work-study', '/profile']`，进任何其他路径被强制重定向到 `/work-study`
- **平台超管**：`/api/v1/platform/auth/login`（公共 schema 的 `platform_admin` 表，跨租户操作）

---

## 4. 业务模块详细规格

### 4.1 请销假 Leave（最复杂的模块）

#### 4.1.1 数据模型（V010 + V032 + V043 + V046–V099）
**leave_request** 表关键字段：
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint PK | |
| `student_id` / `student_name` | bigint / text | 学生快照 |
| `leave_type_code` / `leave_type_name` | varchar / text | 假别快照 |
| `start_time` / `end_time` | timestamptz | 起止时间 |
| `duration_days` | numeric(5,2) | V097 起两位小数（半天精度），由 `duration_days(start,end)` 内置函数四舍五入到 0.5 |
| `reason` | text | 必填 |
| `form_data` | jsonb | 自定义字段（按 leave_type 配置）|
| `attachments` | jsonb | `[{file_id, file_name, file_url, file_size}, ...]` |
| `status` | varchar(16) | `draft` / `pending` / `approved` / `rejected` / `cancelled` / `cancel_pending` / `pending_manual_return` |
| `workflow_instance_id` | bigint | 关联 `workflow_instance.id` |
| `submitted_by` | bigint | 提交人（代提交场景 ≠ student_id） |
| `is_proxy` | boolean | 代提交标识 |
| `apply_latitude` / `longitude` / `apply_location_at` | numeric / timestamptz | 申请时定位 |
| `return_latitude` / `longitude` / `return_location_at` | numeric / timestamptz | 销假定位 |
| `return_source` | varchar | `gps` / `manual_approve` / `manual_force` / `access_card` |
| `manual_return_reason` / `manual_return_attachments` / `manual_return_submitted_at` | text / jsonb / timestamptz | 学生人工销假兜底通道 |
| `reminder_sent_mask` | int | bitmask: 1=start, 2=pre_end, 4=due, 8=overdue（V069 新增）|
| `ai_draft` | jsonb | AI 预填快照 `{source, model, raw_input, predicted_fields, confidence, generated_at}` |
| `config_snapshot` | jsonb | V079 起：每条请假冻结当时的 leave_v3 DSL 快照，避免规则改了之后历史审批走样 |
| `term_id` / `term_code` | bigint / varchar | V087 学期累计上限挂钩 |

#### 4.1.2 假别配置 leave_type_config + leave_global_config
- `leave_type_config`：每假别一行 `{code, name, parent_code, extra_fields, require_attachment, enabled, max_days, term_max_days}`
- `extra_fields`：JSONB 数组 `[{field_key, field_label, field_type: text|select|date|file, required, options, visible_when}]`
- `leave_global_config`（V096，租户级单行）：`term_max_days`——本学期所有假别累计上限；超过仅做软警告 + 工作流任务的 high 风险评分（PendingTaskEnricher 用）

#### 4.1.3 工作流 leave_v3（V083 完整链路 9 个）
9 条 v3 链路按"假别 + 时长"分支：例如事假 ≤3 天 → 班主任 → 院；事假 >3 天 → 班主任 → 院 → 校；病假 / 探亲 / 因公等节点不同。每条链统一 5 节点类型：

```yaml
nodes:
  - id: start          type: form_submit   学生提交
  - id: counselor_approval  type: approval (role: counselor, scope: same_class, timeout: 48h)
  - id: duration_check type: condition  分支条件 duration_days > 3
  - id: college_approval type: approval (role: dean, scope: same_college, timeout: 72h)
  - id: approved       type: end (status: completed)
  - id: rejected       type: end (status: rejected)
```

支持节点类型见 `NodeType.java`：`FORM_SUBMIT / APPROVAL / CONDITION / NOTIFICATION / PUBLICITY / END`。

#### 4.1.4 销假流程（V086 起改为非工作流）
两条通道：
1. **GPS 自动销假**：`POST /api/v1/leaves/{id}/return/by-location`，按 `leave-return/campus-geofence`（多边形）判断。命中即 `return_source=gps`。
2. **学生人工销假申请**：GPS 不在围栏 → `POST /api/v1/leaves/{id}/return/manual-apply`（理由 + 附件） → 状态变 `pending_manual_return` → 班主任 `POST /api/v1/leaves/{id}/return/manual-review`（approve/reject） → 通过即 `return_source=manual_approve`，否则继续 `approved` 等待。
3. **门禁回调**：`POST /leave-return/access-callback`（`return_source=access_card`），来源未来对接校园一卡通。
4. **辅导员强制销假**：`return_source=manual_force`，绕过 GPS。

#### 4.1.5 提醒（V090 模板 + V069 mask）
`LeaveReminderScheduler` 定时扫描 `leave_request`：
- `start`（请假开始 1 小时内未到岗）
- `pre_end`（结束前 6 小时）
- `due`（应销假未销）
- `overdue`（逾期未销 24h+）

发出后置 `reminder_sent_mask` 对应 bit，避免重复推送。模板从 `notification_template`（`code` 形如 `LEAVE_NEAR_RETURN`）取。

#### 4.1.6 端点清单（前端调用）
```
GET    /api/v1/leave-types                          # 启用假别（学生用）
GET    /api/v1/leave-types?include_disabled=true    # 全量假别（管理用）
PUT    /api/v1/leave-types/{code}/enabled
PUT    /api/v1/leave-types/{code}/extra-fields
GET    /api/v1/leave-types/{code}/extra-fields

GET    /api/v1/leaves/global-config
PUT    /api/v1/leaves/global-config                 # term_max_days 等
PUT    /api/v1/leaves/global-config/require-proof   # V098 是否要求附件

GET    /api/v1/leaves/term-usage                    # 当前学生本学期已用天数
GET    /api/v1/leaves/term-usage/{studentId}        # 教师查指定学生

POST   /api/v1/leaves                               # 申请
POST   /api/v1/leaves/proxy                         # 代申请
GET    /api/v1/leaves/my
GET    /api/v1/leaves/{id}
GET    /api/v1/leaves/class                         # 班级列表
GET    /api/v1/leaves/uncancelled
GET    /api/v1/leaves/pending-manual-returns
GET    /api/v1/leaves/stats

GET    /api/v1/leaves/{id}/impact                   # 影响预览（请假对课表 / 考勤的影响）
GET    /api/v1/leaves/impact/preview                # 提交前预览
GET    /api/v1/leaves/impact/config
PUT    /api/v1/leaves/impact/config

GET    /api/v1/leaves/notice/config                 # 学生承诺书内容
PUT    /api/v1/leaves/notice/config

POST   /api/v1/leaves/{id}/withdraw                 # 撤回（pending 阶段）
POST   /api/v1/leaves/{id}/cancel                   # 销假申请（已通过后）
POST   /api/v1/leaves/{id}/cancel-confirm           # 教师确认销假
POST   /api/v1/leaves/{id}/force-cancel             # 强制销假

POST   /leaves/{id}/return/by-location              # 返校 GPS
POST   /leaves/{id}/return/manual-apply             # 人工销假申请
POST   /leaves/{id}/return/manual-review            # 人工销假审核
GET    /leave-return/campus-geofence
PUT    /leave-return/campus-geofence
POST   /leave-return/access-callback                # 一卡通回调

# 工作流配置（NL → DSL，AI 生成）
GET    /api/v1/workflow-config/summary
GET    /api/v1/workflow-config/yaml
GET    /api/v1/workflow-config/versions
POST   /api/v1/workflow-config/rollback             # 回滚到指定版本
POST   /api/v1/workflow-config/apply                # 应用 AI 生成的 patch
```

#### 4.1.7 配置版本化（V076 / V077 / V078 / V079 / V099）
- `leave_config_base`：当前生效的 base
- `leave_config_patch`：每次 NL 编辑产出一条 patch（`type=time`，`scope:{from,to,orgIds}`，`diff:[{path, op, value}]`）
- `leave_config_changelog`：历史 changelog
- `leave_request.config_snapshot`：每条请假冻结快照
- `workflow_definition.change_summary`（V099）：≤200 字中文摘要

### 4.2 工作流引擎 Workflow（xg-platform 核心）

#### 4.2.1 数据模型（V007 + V031 + V082 + V091 + V092）
- `workflow_definition`：`id, code, name, version, biz_type, college_scope, config_yaml, config_json, status: draft/published/disabled, change_summary`
- `workflow_instance`：`id, definition_id, business_type, business_id, initiator_id, status: running/completed/rejected/cancelled/timeout, current_node_id, started_at, finished_at`
- `task_instance`：`id, workflow_instance_id, node_id, node_name, assignee_id, status: pending/approved/rejected/withdrawn/timeout, comment, decided_at`
- `form_data`：动态表单数据，关联 `business_id`
- `ai_recommendation_log`（V060）：AI 审批建议日志（accepted / rejected / ignored）

#### 4.2.2 节点类型（NodeType.java）
| 类型 | 执行器 | 行为 |
|---|---|---|
| `FORM_SUBMIT` | `FormSubmitExecutor` | 表单提交节点（起点）|
| `APPROVAL` | `ApprovalExecutor` | 审批，按 `assignee.role + scope` 解析 assignee；超时 `timeout.duration` 进入 timeout |
| `CONDITION` | `ConditionExecutor` | 表达式分支，`branches: [{when: "duration_days > 3", next: ...}, {when: default, next: ...}]` |
| `NOTIFICATION` | `NotificationExecutor` | 触发通知模板（V092 起 `task_arrived` 事件双轨）|
| `PUBLICITY` | `PublicityExecutor` | 公示节点（V049）：定时段后自动通过 |
| `END` | `EndExecutor` | 终态，发布 `WorkflowFinishedEvent`，`status=completed/rejected/cancelled/timeout` |

#### 4.2.3 表达式语言（受限语法）
`ExpressionEvaluator` + `BuiltInFunctions`：
- 内置函数：`durationDays(start, end)` / `dateDiff(d1, d2, unit)` / `ifThen(cond, t, f)`
- 不允许通用脚本（无 `eval`、无类反射）
- 用于 `condition.branches.when` 与 form schema 的 `visible_when`

#### 4.2.4 表单 schema（FormField + FormSchema + FormDataValidator）
```typescript
interface FormField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'file';
  required: boolean;
  options?: string[];          // select 用
  indexed: boolean;            // 是否落地为 generated column 索引
  deprecated: boolean;
  placeholder?: string;
  pattern?: string;            // 正则
  minLength / maxLength: int;
  min / max: double;
  widget?: 'textarea' | 'radio' | 'select' | 'cascader' | 'date_range' | ...;
  fileMaxCount?: int;
  fileAccept?: string;         // "image/*" / ".pdf,.doc"
  fileMaxSizeKb?: long;
}
```

`FormDataValidator`：服务端按 type 校验，type=file 时 value 必须为 `string[]`（file_id 数组）。

#### 4.2.5 Assignee 解析（BuiltinAssigneeStrategy + GlobalRoleStrategy）
- `role: counselor, scope: same_class` → 查学生班级 → counselor_org_mapping
- `role: dean, scope: same_college` → 查学生学院 → 院领导
- 支持静态 `user_id`、动态 `expression`

#### 4.2.6 Timeline（前端审批可视化）
`InstanceTimelineService` 生成 `InstanceTimelineVO`：
```typescript
interface InstanceTimeline {
  instance_id; biz_type; status; current_node_id;
  nodes: TimelineNode[];        // {state: completed|in_progress|pending, decision?, duration_ms, actor: {id, name, role}, due_at, ...}
  outcome_preview: { on_approve, on_reject };  // 当前审批后的下一步预测
}
```
前端 `WorkflowTimeline` 组件渲染。

#### 4.2.7 端点
```
GET    /api/v1/workflows/role-codes
POST   /api/v1/workflows/definitions/author        # AI 生成 DSL（调 sidecar）
GET    /api/v1/workflows/form-schema
POST   /api/v1/workflows/definitions
PUT    /api/v1/workflows/definitions/{id}
POST   /api/v1/workflows/definitions/{id}/publish
PUT    /api/v1/workflows/definitions/{id}/form-fields
GET    /api/v1/workflows/definitions/{id}/diff-preview
GET    /api/v1/workflows/definitions
GET    /api/v1/workflows/definitions/{id}
POST   /api/v1/workflows/instances
GET    /api/v1/workflows/instances/{id}
GET    /api/v1/workflows/instances/{id}/timeline
POST   /api/v1/workflows/instances/{id}/withdraw
POST   /api/v1/workflows/instances/{id}/appeal
POST   /api/v1/workflows/tasks/{taskId}/approve
POST   /api/v1/workflows/tasks/{taskId}/reject
POST   /api/v1/workflows/tasks/batch-approve       # 批量审批
GET    /api/v1/workflows/tasks/pending
GET    /api/v1/workflows/tasks/history
GET    /api/v1/workflows/tasks/pending-enriched    # 含 AI 风险信号
GET    /api/v1/workflows/tasks/{taskId}/ai-recommendation
```

#### 4.2.8 PendingTaskEnriched（AI 风险增强）
`PendingTaskEnricher` 给每条待审任务附加：
- `risk_level`：low / medium / high
- `reasons`：触发理由（如 "本学期已请假 7.5 天，超过上限 5 天"）
- `applicant_stats`：30 天缺勤次数、30 天请假数、当前 open alerts（critical / high / medium / low）、未处理违纪、90 天违纪数
- `leave_*`：请假快照字段

### 4.3 通知中心 Notification（V006 投递层 + V089 路由层）

#### 4.3.1 双轨架构
> 这层加的是 "业务事件 → 模板 + 偏好 → send" 的路由层（轨 2），独立于 YAML notification 节点直接发（轨 1）。
> 双轨去重靠 `notification.template_code` 列 + `(source_type, source_id, template_code)` 唯一索引。

#### 4.3.2 五张表
1. **notification**（V006）：`id, title, content, level: normal/important/urgent, source_type: workflow/system/notification_task, source_id, channels: text[] {in_app, miniprogram, wecom}, require_confirm, sender_id, template_code (V089)`
2. **notification_recipient**（V006）：每人每渠道一条 `{notification_id, user_id, channel, status: pending/sent/failed, confirmed, read_at, retry_count, last_error}`
3. **notification_template**（V089）：`code (LEAVE_APPROVED 等), category: business/care/system, biz_module, title_tmpl, body_tmpl ({{var}} 占位), default_channels: text[], default_level, wx_template_id, enabled`
4. **notification_preference**（V089）：`scope_type: role/user, scope_value, template_code, channels: text[] (空数组=静默), muted` —— 允许学生 / 教师细粒度静默
5. **care_rule** + **care_dispatch_log**（V089）：关怀规则（按假别 / 时机匹配） + 同 rule + 同业务对象只发 1 次

#### 4.3.3 Recipient 解析器（platform/notification/recipient/impl）
- `ApplicantResolver` / `ApplicantClassMonitorResolver` / `ApplicantClassMasterResolver` / `ApplicantCounselorResolver` / `ApplicantDeanResolver` / `CurrentApproverResolver` / `StaticUserResolver`
- 工作流 YAML 的 `notification` 节点 `recipients: [counselor, applicant]` 由这些 Resolver 推导出 user_id 列表

#### 4.3.4 编程契约（CLAUDE.md 红线）
> 新模块发通知 = (1) INSERT 一行 `notification_template` seed (2) 调 `NotificationOrchestrator.send(code, sourceType, sourceId, recipients, vars)`。
> 通知中心 UI / AI 助手识别 / 角色偏好 / 双轨去重 / 三渠道扇出 全部自动适配，禁止业务侧绕开 Orchestrator 直接 `NotificationService.send`。

#### 4.3.5 端点
```
GET    /api/v1/notifications                                # 我的通知列表
PUT    /api/v1/notifications/{id}/read
POST   /api/v1/notifications/{id}/confirm                   # require_confirm=true 时

GET    /api/v1/notification-center/templates
PUT    /api/v1/notification-center/templates/{code}
GET    /api/v1/notification-center/preferences
PUT    /api/v1/notification-center/preferences
GET    /api/v1/notification-center/care-rules
POST   /api/v1/notification-center/care-rules
PUT    /api/v1/notification-center/care-rules/{id}
DELETE /api/v1/notification-center/care-rules/{id}
```

### 4.4 学生画像 Student（V014 + V040 + V043 + V054 + V065 / V066 + V095）

#### 4.4.1 数据模型
- **student_profile**：`user_id, student_no, grade, college, major, class_name, class_id, enrollment_date, status: active/suspended/graduated/withdrawn, education_level (V040), aid_level (V054), residential_track (V095), extended_info (V043 jsonb)`
- **field_definition**（V043）：动态字段元数据 `{code, label, field_type: text/number/date/select/textarea, options, placeholder, required, sort_order, enabled}` —— 管理员 UI 加一个字段不需要 DDL，直接写到 `student_profile.extended_info`
- **emergency_contact**（V065/V066）：紧急联系人字段 + 姓名

#### 4.4.2 端点
```
GET    /api/v1/students                            # 列表 + 高级过滤
GET    /api/v1/students/{id}
POST   /api/v1/students                            # 单个录入
POST   /api/v1/students/batch                      # 批量
PUT    /api/v1/students/{id}
DELETE /api/v1/students/{id}
GET    /api/v1/student-classes                     # 我的班级（教师视角）
GET    /api/v1/counselor/class-roster              # 学生花名册

GET    /api/v1/field-definitions
POST   /api/v1/field-definitions
PUT    /api/v1/field-definitions/{id}
DELETE /api/v1/field-definitions/{id}

# 字段字典（V044 + pg_trgm 三元相似）
GET    /api/v1/field-catalog/page                  # 复用推荐：相似 label / description / aliases
```

#### 4.4.3 字段字典（V044）—— 跨流程字段复用
- 表 `field_catalog`：每租户一份，记录"全部用过的字段"
- 索引：`gin (label gin_trgm_ops)` + `gin (description gin_trgm_ops)`，pg_trgm 模糊匹配
- 排序权重：`canonical desc, usage_count desc`
- AI 体感：管理员加新字段时 → AI 检索 + 精排 + 候选卡片复用，避免同义字段散乱（"手机号" / "联系电话" / "phone"）
- 字段含 `target_table / target_path / write_strategy: none/overwrite/append_history/request`，为后续 ProfileSync 留位

### 4.5 考勤 Checkin（V012）
- **checkin_activity**：`title, creator_id, scope_org_ids: bigint[], expected_count, checkin_mode: qr_scan/roll_call, qr_code_secret, qr_refresh_interval (秒), late_threshold_minutes (默认 5), start_time, end_time, enable_checkout, checkout_end_time, status: active/closed, geo_fence (jsonb 多边形)`
- **checkin_record**：`activity_id, student_id, status: on_time/late/absent, checked_in_at, checked_out_at, source: qr_scan/roll_call/manual, location (jsonb), operator_id, note`
- 唯一索引 `(activity_id, student_id)` 保证一人一活动一条
- 端点：
```
POST /api/v1/checkins/activities                   # 创建
GET  /api/v1/checkins/activities
GET  /api/v1/checkins/activities/{id}
PUT  /api/v1/checkins/activities/{id}
POST /api/v1/checkins/activities/{id}/close
POST /api/v1/checkins/scan                         # 学生扫码
POST /api/v1/checkins/checkout                     # 签退
POST /api/v1/checkins/roll-call                    # 教师点名（含批量未到 absent）
POST /api/v1/checkins/supplement                   # 事后补签（manual）
GET  /api/v1/checkins/records
```

### 4.6 数据采集 Collection（V011）
- **collection_form**：表单定义（每教师建）`{title, fields: jsonb [...], scope_type: class/college/school, scope_org_ids, status: draft/published/closed, deadline, allow_edit, task_id (link to school task), source_form_id (复制来源)}`
- **collection_task**：校级任务 → 派发到多个 form
- **form_submission**：学生提交 `{form_id, student_id, data: jsonb, submitted_at, modified_at}`
- 端点：
```
GET  /api/v1/collections/forms
POST /api/v1/collections/forms
POST /api/v1/collections/forms/{id}/copy
POST /api/v1/collections/forms/{id}/publish
GET  /api/v1/collections/forms/{id}/submissions
POST /api/v1/collections/forms/{id}/submissions    # 学生填表
PUT  /api/v1/collections/forms/{id}/submissions/{sid}
GET  /api/v1/collections/tasks
POST /api/v1/collections/tasks                     # 校级建任务
```

### 4.7 违纪与处分 Violation（V017 + V035）

#### 4.7.1 数据模型
- **violation_record**：`student_id, category: exam_cheat/dorm_violation/absence/fighting/other, occurred_at, location, description, recorder_id, punishment_id`
- **punishment**：`level: warning/serious_warning/demerit/probation/expulsion, reason, effective_date, expiry_date, status: pending/effective/lifted/rejected, issuer_id`
- **violation_appeal**（V035）：`violation_id, appellant_id, reason, status: pending/approved/rejected, decided_by, decided_at, decision_note`

#### 4.7.2 工作流
违纪上报 → 班主任审核 → 院级处分 → （V049）公示 → 生效。学生可发起 `appeal` → 院领导审。

#### 4.7.3 端点
```
GET    /api/v1/violations
POST   /api/v1/violations
PUT    /api/v1/violations/{id}
GET    /api/v1/violations/{id}
POST   /api/v1/violations/{id}/approve
POST   /api/v1/violations/{id}/reject
GET    /api/v1/punishments
POST   /api/v1/punishments
PUT    /api/v1/punishments/{id}/lift                # 解除处分
GET    /api/v1/violations/appeals
POST   /api/v1/violations/appeals
POST   /api/v1/violations/appeals/{id}/resolve
```

### 4.8 勤工助学 Work-Study（V018 + V030 + V055 + V056 + V068 + V058）

#### 4.8.1 数据模型
- **work_study_position**：`title, position_type: fixed/temporary, department_name, description, requirements, prefer_financial_aid, hourly_rate (numeric 6,2), weekly_hours, headcount, hired_count, status: draft/pending_approval/open/closed, start_date, end_date, creator_id`
- **work_study_application**：`position_id, student_id, intro, financial_aid_level, status: pending/recommended/hired/rejected, decision_note`
- **work_study_timesheet**（V055）：`application_id, period: yyyy-mm, hours, salary_amount, status: pending/approved/disputed/finalized`
- **employer**（V052）：`name, contact, deposit_status, ...`
- **year_setting**（V052）：每学年 / 学期工助配额、薪酬上限
- **student_workstudy_preference**（V068）：学生偏好（领域、最长每周时数、不愿场地）

#### 4.8.2 流程
1. 用工单位 / 院级发布岗位 → （work_study_workflow_v2 V055）校级 setup_approve → status=open
2. 学生申请 → 用工单位审 → 学生确认 → status=hired，`hired_count += 1`
3. 月度时数登记 → 校财务 salary:process（V056 salary workflow） → 发薪

#### 4.8.3 端点
```
GET  /api/v1/work-study/positions
POST /api/v1/work-study/positions
PUT  /api/v1/work-study/positions/{id}
POST /api/v1/work-study/positions/{id}/close
GET  /api/v1/work-study/applications
POST /api/v1/work-study/applications
PUT  /api/v1/work-study/applications/{id}/decide   # employer 决策
POST /api/v1/work-study/applications/{id}/confirm  # 学生最终确认
GET  /api/v1/work-study/timesheets
POST /api/v1/work-study/timesheets
PUT  /api/v1/work-study/timesheets/{id}/approve
GET  /api/v1/work-study/employers
POST /api/v1/work-study/employers
GET  /api/v1/work-study/year-settings
PUT  /api/v1/work-study/year-settings
GET  /api/v1/work-study/preferences                # 学生偏好
PUT  /api/v1/work-study/preferences
```

### 4.9 异常预警 Alert（V009 + V023 + V028 + V036）

#### 4.9.1 规则模型（platform/alert/dsl）
- `AlertRuleDsl`：完整 YAML/JSON DSL，含 `WindowSpec`（时间窗）、`ScopeSpec`（学生过滤范围）、`AggregationSpec`（聚合）、`ActionSpec`（动作）、`AiHookSpec`（AI 增强）
- 三类规则：`frequency`（窗口内事件超阈）/ `consecutive`（连续 N 次）/ `composite`（组合）
- 严重度：low / medium / high / critical
- V036 噪声治理：muted_until / dismiss_count，规则 ack 后 N 天内同条件不再触发

#### 4.9.2 引擎
- `AlertRuleEngine` 主入口
- `FilterCompiler` 把 DSL filter 编译成 SQL where
- `AggregationExecutor` 执行 SUM/COUNT/MAX 等
- `RuleConditionEvaluator` 评估 `condition` 表达式（独立于 workflow 的）
- `AlertDevScanScheduler` 定时扫描

#### 4.9.3 数据
- **alert_rule**：`name, rule_type, config (jsonb), severity, enabled`
- **student_alert**：`student_id, alert_rule_id, rule_name, severity, trigger_data (jsonb), status: open/acknowledged/resolved/dismissed, acknowledged_by, note`

#### 4.9.4 端点
```
GET    /api/v1/alerts
PUT    /api/v1/alerts/{id}/acknowledge
PUT    /api/v1/alerts/{id}/resolve
PUT    /api/v1/alerts/{id}/dismiss
GET    /api/v1/alert/rules
POST   /api/v1/alert/rules
PUT    /api/v1/alert/rules/{id}
DELETE /api/v1/alert/rules/{id}
POST   /api/v1/alert/rules/validate
POST   /api/v1/alert/rules/preview                 # 干跑预览命中学生
GET    /api/v1/alert/catalog                       # 推荐规则模板
POST   /api/v1/alert/scan                          # 手工触发扫描
```

### 4.10 学生事件流 Student Event（V008 / V025 / V041 / V042）
**student_event_log**（append-only）：跨模块事件中央总线
- `event_type`：`leave_submit, leave_approved, checkin_absent, checkin_late, violation_recorded, punishment_issued, complaint_submit, workstudy_apply, ...`
- `event_source`：`leave / checkin / violation / workstudy / collection / system`
- `event_data` (jsonb)
- `severity`（V025）：low / medium / high / critical
- `occurred_at`

被 alert 引擎、insight、AI 助手统一消费。
端点：
```
GET /api/v1/students/{studentId}/events
GET /api/v1/events/scan/notification-unconfirmed   # 检查 require_confirm 的通知未确认情况
```

### 4.11 工作日志 Worklog（V016）
**work_log**：`recorder_id, student_id (可选), category: counsel/visit/meeting/event, content, occurred_at, attachments (jsonb)` —— 辅导员日常工作记录，用作 KPI / 痕迹管理。

### 4.12 辅导员谈话 Counselor Talk（V037）
**counselor_talk**：结构化谈话记录 `{counselor_id, student_id, topic, content, follow_up, occurred_at, attachments}`

### 4.13 学历事件 / 课表 Academic（V070 / V071 / V072 / V073）
- **academic_term**：`code (2025-2026-1), name, start_date, end_date, total_weeks, is_current` —— 决定学期进度环、当前周次、距期末考天数
- **class_schedule**：`class_id, term_id, week_pattern (jsonb {weeks, weekdays, period}), course_name, teacher, location` —— 一节课多周次
- **academic_event**：`name, type: exam/holiday/military_training/...., start_date, end_date, scope_type, scope_org_ids` —— 校历类事件，请假冲突预警
- 端点：
```
GET    /api/v1/academic/terms
POST   /api/v1/academic/terms
PUT    /api/v1/academic/terms/{id}
PUT    /api/v1/academic/terms/{id}/set-current
GET    /api/v1/academic/events
POST   /api/v1/academic/events
GET    /api/v1/academic/class-schedules
POST   /api/v1/academic/class-schedules
POST   /api/v1/academic/class-schedules/sync       # 批量同步（教务系统对接）
```

### 4.14 工作台 Workspace + AI 洞察 Insight（V024 + V026）

#### 4.14.1 工作台指标 WorkspaceMetricsService
角色化指标聚合：
- 辅导员：`{my_class_count, today_pending_leave, today_pending_collection, this_week_late, ...}`
- 院领导：`{college_pending_leave, college_open_alerts, ...}`
- 校管：`{school_pending_workstudy, school_critical_alerts, ...}`

#### 4.14.2 AI 洞察 workspace_insight（V024）
- 由 `InsightScanScheduler` 每天生成 一次（或按需 `/api/v1/insights/refresh` 触发）
- 入参：`metrics`（aggregates JSONB） + `role: counselor/dean`
- 调 sidecar `/api/v1/insights` → DeepSeek，最多 3 次工具调用 drilldown
- 输出 `insights`：`[{severity, category, title, detail, suggestion, refs: [{type: student/leave/violation/..., id}]}]`
- 严重度一致性检查 + 不允许伪造 ref（CI eval `eval/insight_eval.py`）
- `insight_feedback` 表（V026）：用户对单条 insight `helpful/not_helpful/false_alarm`，喂回 prompt 调优

#### 4.14.3 端点
```
GET  /api/v1/workspace/metrics
GET  /api/v1/insights                              # 缓存命中
POST /api/v1/insights/refresh                      # 强制刷新
POST /api/v1/insights/{id}/feedback
GET  /api/v1/system/ai-metrics                     # 系统级 AI 用量 / 命中率
```

### 4.15 知识库 Knowledge / RAG（public.knowledge_base + V003 + V004）

#### 4.15.1 模型
- **knowledge_base**：`name, embedding_model, embedding_dim (default 512), rerank_model, chunk_size (500), chunk_overlap (50), retrieval_mode: vector/keyword/hybrid, top_k (5), score_threshold`
- **kb_document**：`kb_id, name, source_type: file/url/manual, source_meta, file_size_bytes, file_hash, char_count, chunk_count, enabled, indexing_status`
- **kb_chunk**：`document_id, chunk_index, content, embedding vector(512)`，HNSW + GIN(tsvector) 双索引
- **kb_eval_case**（V004）：`{kb_id, query, expected_doc_ids, note}` —— gold set
- **knowledge_qa**（租户内）：用户问答日志 `{user_id, question, answer, sources: [{doc_id, title, url}], category, helpful}`

#### 4.15.2 检索流程
1. 关键词模式：BM25 / tsvector
2. 向量模式：pgvector cosine（HNSW）
3. 混合模式：RRF 融合 → 可选 rerank model
4. 命令检测：query 含"帮我请假/我想销假"等指令意图 → 直接短路返回空（避免规则污染）
5. 兜底：KB 异常 → 走 legacy 关键词 retriever

#### 4.15.3 端点（sidecar）
```
GET    /api/v1/kb
POST   /api/v1/kb
GET    /api/v1/kb/{id}
PATCH  /api/v1/kb/{id}
DELETE /api/v1/kb/{id}
GET    /api/v1/kb/{id}/documents
POST   /api/v1/kb/{id}/documents                   # multipart 上传 + 异步切分嵌入
DELETE /api/v1/kb/documents/{doc_id}
GET    /api/v1/kb/documents/{doc_id}/chunks
PATCH  /api/v1/kb/chunks/{chunk_id}                # 启用 / 编辑
POST   /api/v1/kb/{id}/hit-test                    # 调试：测试 query 命中
GET    /api/v1/kb/{id}/eval/cases
POST   /api/v1/kb/{id}/eval/cases
DELETE /api/v1/kb/eval/cases/{case_id}
POST   /api/v1/kb/{id}/evaluate                    # 跑 NDCG / MRR / recall@k
```

### 4.16 文件附件 File（V005）
- **file_metadata**：`bucket, object_key, file_name, mime_type, size_bytes, uploader_id, sha256, business_type, business_id`
- 后端 → MinIO 直传 / 代下载（鉴权后签 URL）
- 单文件上限 10MB，请求体 30MB（`spring.servlet.multipart`）
- 端点：
```
POST /api/v1/files/upload
GET  /api/v1/files/{id}                            # 下载 / 签名 URL
GET  /api/v1/files                                 # 我的附件
DELETE /api/v1/files/{id}
```

### 4.17 系统管理（platform/system）
角色 / 权限 / 用户管理 + 租户级设置：
```
GET    /api/v1/system/roles
POST   /api/v1/system/roles
PUT    /api/v1/system/roles/{id}
DELETE /api/v1/system/roles/{id}
GET    /api/v1/system/permissions
PUT    /api/v1/system/roles/{id}/permissions       # 设置 override
GET    /api/v1/system/users
POST   /api/v1/system/users
PUT    /api/v1/system/users/{id}
DELETE /api/v1/system/users/{id}
PUT    /api/v1/system/users/{id}/password-reset
GET    /api/v1/system/tenant-settings
PUT    /api/v1/system/tenant-settings              # 品牌名 / 功能开关
```

### 4.18 平台超管（公共 schema）
跨租户管理（`platform_admin` 表）：
```
POST /api/v1/platform/auth/login
POST /api/v1/platform/auth/logout
GET  /api/v1/platform/auth/me
# （未来：租户开通 / 续期 / 监控）
```
平台审计 `platform_audit_log`：登录、租户变更、危险操作。

### 4.19 天气 Weather
`/api/v1/weather/current` —— 按 `tenant.school_city`（V006）查询，用于工作台展示 + 户外活动审批参考。

---

## 5. AI 边车（xg-ai）详细规格

### 5.1 进程信息
- 框架：FastAPI 0.110+ / uvicorn
- 端口：8001（dev）/ 8000（容器内）—— Java 通过 `ai.sidecar.base-url` 调用
- 鉴权：内部接口 `X-Internal-Token` + 用户上下文 `X-User-Id` `X-Tenant-Id` `X-User-Role`

### 5.2 核心 API
| 路径 | 用途 |
|---|---|
| `POST /api/v1/chat` | 学生 / 教师对话（含工具调用 + RAG）|
| `POST /api/v1/agent/invoke` | 通用 LangGraph dispatcher（workflow_author / alert_rule_author）|
| `POST /api/v1/insights` | 角色化工作台 AI 洞察生成 |
| `POST /api/v1/task-recommendation` | 待审任务的 AI 风险评估 + 处理建议 |
| `POST /api/v1/tools/{tool_name}/execute` | 通用工具代理（鉴权后转发 Java）|
| `GET /api/v1/health` | 健康检查 |
| `POST /api/v1/transcribe` + `GET /api/v1/transcribe/{order_id}` | 讯飞 lfasr v2 长录音 |
| `GET /api/v1/workflow/hints` | 假别策略提示（无 LLM）|
| `POST /api/v1/workflow/propose` | NL → leave_v3 DSL（带 schema 校验）|
| `POST /api/v1/notifications/propose` | NL → 通知模板 |
| `POST /api/v1/polish/rejection` | 驳回理由教练化润色 |
| `POST /api/v1/kb/*` | 知识库管理（见 4.15）|

### 5.3 Agent 与工具
#### 5.3.1 Workflow Author Agent（langgraph）
- 输入：`AuthorState{current_dsl, instruction, available_roles, [...]}`
- 流程：`Edit Node (LLM) → Validate Node (JSON Schema Draft-7) → On Error → Retry (1 次) → End`
- Schema：`/app/agent/workflow_author/schema.json`，节点类型与 Java 端 `NodeType.java` 对齐
- 角色严格白名单：role 不在 `available_roles` 内 → 返回 `{need_clarification: true, missing_roles: [...]}`

#### 5.3.2 Alert Rule Author Agent
- 自然语言 → `AlertRuleDsl` JSON
- catalog: 预制规则模板（出勤 / 违纪 / 请假模式）

#### 5.3.3 工具注册（app/tool）
30+ 个任务级 tool（每个有 `allowed_roles` 白名单）：
- 查询类：`query_leaves` / `query_notifications` / `query_checkins` / `query_collections` / `query_stats` / `query_work_logs` / `query_violations` / `query_student_events` / `query_work_study` / `query_late_students`
- 工助专用：`find_workstudy_positions_by_preference` / `match_workstudy_positions_to_schedule` / `summarize_workstudy_applicants` / `draft_workstudy_application_intro` / `detect_workstudy_salary_anomaly` / `suggest_workstudy_position_template` / `workstudy_dashboard_brief`
- 配置 / 元数据：`fetch_leave_types` / `fetch_field_catalog` / `_read_workflow_config_summary`
- 工具：`resolve_date`（"下周一" → ISO）
- DSL 翻译：`parse_leave_config_patch`（NL → TimePatch JSON，路径 / 操作 / 值白名单）

#### 5.3.4 LLM 提供商
| 提供商 | 用途 | 默认 |
|---|---|---|
| DeepSeek (OpenAI 兼容) | 主对话 + tool calling | `deepseek/deepseek-v3.2` 通过 ZenMux |
| 通义千问 (Qwen) | 嵌入 + 备用对话 | `qwen-plus` / 嵌入 `qwen-text-embedding-v3` 或 `BAAI/bge-small-zh-v1.5` |
| Anthropic（可选） | 通过 ZenMux | — |

### 5.4 语音输入策略（铁律）
> 禁用 Web Speech API（走 Google）。
> 小程序：微信同声传译插件 WechatSI（开发中需 mp 后台开通）
> 后端长录音：讯飞 lfasr v2（`xfyun_lfasr.py`，HMAC-SHA1 签名）

### 5.5 评估 Eval
- `eval/insight_eval.py`：CI 门禁，16+ 测试用例，覆盖 dean_quiet / dean_critical / counselor_quiet / counselor_critical 等场景，校验 JSON 可解析、严重度一致、不伪造 ref
- `eval/rag_eval.py`：KB 检索 NDCG / MRR / recall@k

### 5.6 环境变量
| 变量 | 默认 | 用途 |
|---|---|---|
| `database_url` | `postgresql://postgres:postgres@localhost:5432/xg1` | 共用 PG |
| `redis_url` | `redis://localhost:6379/1` | 缓存 |
| `java_base_url` | `http://localhost:8080` | xg-backend |
| `internal_token` | `dev-internal-token` | 共享密钥 |
| `qwen_api_key/base_url/model` | — | Qwen |
| `deepseek_api_key/base_url/model` | — | DeepSeek |
| `xfyun_app_id/api_key/api_secret` | — | 讯飞 lfasr |
| `embedding_model/dim` | `BAAI/bge-small-zh-v1.5` / 512 | |
| `rag_top_k/threshold` | 5 / 0.7 | |
| `rate_limit_per_minute` | 10 | |

---

## 6. 前端规格

### 6.1 Monorepo 布局
```
xg-frontend/
├── apps/
│   ├── web/        @xg1/web   (React 18 + Vite + Antd 5)
│   └── mini/       @xg1/mini  (Taro 3 + React 18)
└── packages/
    ├── shared/         @xg1/shared (TS types + axios client)
    └── design-tokens/  @xg1/design-tokens (color/radius/font/anim tokens, web.css + mini.css 自动生成)
```
工具：pnpm 9 + Turbo 2。

### 6.2 Web 路由（apps/web/src/App.tsx）
| 路径 | 页面 | 角色 |
|---|---|---|
| `/login` | login | 公开 |
| `/workspace` | 工作台仪表盘 | 非 employer |
| `/leave` | 统一请假中心（list / rule / return / notice tabs）| 全员 |
| `/leave-config` | → `/leave?tab=...` 重定向（兼容老链接）| - |
| `/collection` | 数据采集 | teacher+ |
| `/checkin` | 考勤管理 | teacher+ |
| `/notification` | 告警规则 / 通知中心 | teacher+ |
| `/student` | 学生列表 + 高级过滤 | teacher+ |
| `/student/:id` | 学生 360° 画像 | teacher+ |
| `/student/fields` | 字段定义管理 | school_admin+ |
| `/work-log` | 工作日志 | teacher+ |
| `/violation` | 违纪 / 处分 | college_admin+ |
| `/work-study` | 勤工助学（employer 唯一可访问业务页）| employer / college_admin+ |
| `/alerts` | 预警规则编辑器 | teacher+ |
| `/counselor-talks` | 谈心记录 | teacher+ |
| `/workflows` | 自定义工作流编辑器（YAML + AI 生成）| school_admin+ |
| `/forms` | 表单构建器 | school_admin+ |
| `/profile` | 个人设置 / 改密 | 全员 |
| `/system/*` | 角色 / 用户 / 组织 / 租户设置 | super_admin |

### 6.3 状态管理
Zustand stores（localStorage 持久化）：
- `auth.store.ts`：`token`、`user: UserInfo`
- `ai-action.store.ts`：AI 聊天上下文（messages / context / activePanel）
- `batch-action.store.ts`：批量选择 / 操作队列
- `layout.store.ts`：sidebar collapsed / panel width
- `locale.store.ts`：zh-CN / en-US

### 6.4 关键组件
- `components/brand/`：`ZhaoxiLogo` / `XiaoxiAvatar` / `XiaozhaoAvatar` / `AssistantAvatar`
- `components/workflow/WorkflowTimeline.tsx`：审批可视化（节点高亮 / outcome preview）
- `components/ai/`：`AskAIChip`（右键问 AI）+ chat drawer
- `components/form/FormBuilder.tsx` / `FormRenderer.tsx`：通用动态表单（消费 FormSchema）
- `components/filters/StudentFilterPanel.tsx`：学生多维过滤（专业 / 班级 / 状态 / 名字 / 导出）
- `components/picker/TencentMapPicker.tsx`：腾讯地图选点（请假地点 / 围栏）
- `components/insight/MetricCard.tsx` + `TrendChart.tsx`
- `components/approval/ApprovalCard.tsx` + `ApprovalTimeline.tsx`

### 6.5 API 模块（apps/web/src/api，33 个 ts 文件）
按资源拆分：academic / ai / alert / auth / checkin / collection / counselor / counselorTalk / fieldCatalog / fieldDefinition / file / insight / kb / knowledge / leave / leavePolicy / leaveReturn / notification / notificationCenter / orgAssignment / rolePermission / sidecar / student / studentEvent / studentInsight / system / tenantSettings / violation / weather / workflow / workflowConfig / workLog / workStudy。

### 6.6 错误提示统一
`describeApiError` helper（覆盖 16 个文件 ~47 处 onError）：透传后端 `BizException.message`，避免出现"未知错误"。

### 6.7 小程序 Mini Program（Taro 3）
#### 6.7.1 应用配置
- 自定义 tabBar（`src/custom-tab-bar/`），中间 AI 圆形按钮调出 `AIChatDrawer`
- 三个 tab：`首页 / 应用 / 个人中心`
- 业务页（不在 tabBar）：leave/list、leave/detail、leave/apply、leave/approval、leave/class、schedule、workStudy、workStudyMatch、workStudyDetail、myWorkStudy、myProfile、notifications、login

#### 6.7.2 设计 Token（packages/design-tokens/src/mini.css）
- 单位：rpx（设计宽 750）
- 字体：`--font-body` / `--font-display`（负字距 headline）/ `--font-mono`（数字）
- 点击区：`.tap-min` 强制 ≥ 88rpx (44pt)
- 文字最小 28rpx
- 强调色预算：每屏 ≤ 2 个 accent（CLAUDE.md 强约束）
- 状态色：`--ok` / `--warn` / `--danger`（与 statusMobile token 对应）
- 圆角：`--r-xs` 到 `--r-xl`（不写死 border-radius）

#### 6.7.3 关键页交互
- **leave/apply**：表单按 leave_type 动态加载 extra_fields；选择假别后显示 `policy hints`（V096 全局上限警告）；可上传附件；GPS / 腾讯地图选点；AI 助手可一键预填（`ai_draft.source=chat_agent`）
- **leave/list + leave/detail**：含工作流 timeline 缩略图
- **schedule**：当前周课表 + 缺勤预警
- **workStudy**：学生看岗位列表，按 schedule 过滤冲突
- **AIChatDrawer**：流式输出，支持语音输入（WechatSI 插件，未开通时只提示"语音插件未加载"，不影响其他功能）

### 6.8 共享 Type（packages/shared/src/types）
- `auth.ts`：`UserInfo` / `RoleCode` 联合类型 / `LoginRequest|Response`
- `leave.ts`：`LeaveRequest` / `LeaveTypeConfig` / `LeavePolicy` / `LeaveStatus` / `AiDraft`
- `workflow.ts`：`WorkflowDefinition` / `WorkflowInstance` / `TaskInstance` / `TimelineNode` / `PendingTaskEnriched` / `ApplicantStats` / `RiskLevel`
- `api.ts`：`ApiError` / `PagedResponse<T>` / `ApiResponse<T>`

### 6.9 设计 Token
（design-tokens/src/tokens.ts，自动生成 web.css + mini.css）
- 主色 indigo `#6366f1`、辅色 cyan `#0891b2`
- 状态色：ok/warn/danger（web 与 mobile 各一套）
- Surface：5 级灰阶
- 文字：5 级层级
- 圆角：xs 3px → xl 14px (web) / 12px → 20px (mini)
- 字体：Geist Sans + Geist Mono；body 13px，line-height 1.55，letter-spacing -0.005em

---

## 7. 关键工作流时序图

### 7.1 学生请假
```
学生 (mini)              Java :8080                    AI :8000              DB
  │ 选假别 → 加载 extra_fields                              │
  │──→ GET /api/v1/leave-types                              │
  │                                                         │
  │ 写理由（可点 AI 预填）                                  │
  │──→ POST /api/v1/chat (用 leave_apply 上下文)            │
  │                            ───→ /api/v1/chat            │
  │                            ←── AiDraft (predicted_fields)│
  │                                                         │
  │ 提交                                                    │
  │──→ POST /api/v1/leaves (含 ai_draft 快照)              │
  │                            INSERT leave_request          │
  │                            创建 workflow_instance       │
  │                            ApprovalExecutor 解析 assignee│
  │                            INSERT task_instance pending │
  │                            发 NotificationOrchestrator   │
  │                                                          │
  ╲                                                       ╱
                                              ↓
                                    辅导员 (web) 收通知
                                    PendingTaskEnricher 给 risk_level
                                    POST /tasks/{id}/approve
                                    EndExecutor → WorkflowFinishedEvent
                                    ↓
                                    LeaveWorkflowListener
                                    UPDATE leave_request.status=approved
                                    NotificationOrchestrator → 学生 LEAVE_APPROVED
```

### 7.2 GPS 销假（happy path）
```
学生 (mini) 到校门口扫"销假"                  Java                围栏配置
   │── POST /leaves/{id}/return/by-location  ──→ 检查多边形       ←── campus-geofence
   │   (lat, lng, captured_at)                    Point in Polygon
   │                                                ✓
   │                                                UPDATE return_source=gps
   │                                                + return_*at fields
   │                                                状态保持 approved
   │                                                发 LEAVE_RETURNED 通知
```
不命中围栏 → 学生发起 manual-apply → 班主任 review。

### 7.3 通知双轨去重
```
工作流 YAML 节点 notification → NotificationExecutor
  │
  └─→ NotificationOrchestrator.send(template_code, source_type, source_id, ...)
        │
        ├─→ 查 notification_template (按 code)
        ├─→ 查 notification_preference (角色 / 用户级覆盖)
        ├─→ Recipient resolvers 解出 user_id 列表
        ├─→ INSERT notification (含 template_code)
        │   ON CONFLICT (source_type, source_id, template_code) DO NOTHING  ← 双轨去重
        ├─→ INSERT notification_recipient × N (channel × user)
        └─→ 异步推送 (in_app / miniprogram / wecom)
```

---

## 8. 非功能性要求

### 8.1 性能
- 单 8 核 16G 节点支撑 1 万学生（`tenant.max_users` 默认 10000）
- HikariCP 池 20 连接 / Redis maxmemory 128MB / MinIO 单实例
- pgvector HNSW + GIN 索引保证 KB 检索 < 200ms（5 个 top_k）
- AI sidecar：rate limit 10/min/user，DeepSeek 单次 ≤ 60s timeout

### 8.2 可用性 / 降级
- AI 不可用：所有业务通过传统界面完整运行（前端 try-catch 包裹 AI 调用）
- KB 异常：legacy 关键词 retriever 兜底
- 微信 ASR 插件未加载：提示但不阻塞其他功能
- 工作流 timeout：节点 timeout 后状态 = `timeout`，可在 `/instances/{id}/withdraw` 手工撤回
- Flyway baseline-on-migrate：避免老库报错

### 8.3 数据安全
- 密码：BCrypt
- JWT：Sa-Token + Redis 集中失效
- 多租户：Schema 隔离 + MyBatis-Plus 自动注入 tenant_id
- 学生敏感字段（身份证 / 资助等级）：`student:sensitive` 权限
- 平台审计：`platform_audit_log`（公共 schema）记录跨租户危险操作
- 上传文件：sha256 去重 + business_type/business_id 关联

### 8.4 可观测性
- 日志：`/private/tmp/xg_app.log`
- Prometheus：`management.metrics` + Micrometer，`docker-compose.yml` full profile 含 Prometheus + Grafana
- AI 用量：`ai_recommendation_log` / `workspace_insight.metrics` 留存原始指标，方便回溯

### 8.5 兼容性
- 浏览器：Chrome / Edge / 移动 Safari 最近 2 个大版本
- 小程序：微信 8.0+
- Java 17 / Node ≥ 18 / pnpm 9.1.0 / TypeScript 5.4 / Spring Boot 3.x

---

## 9. 部署与配置

### 9.1 容器拓扑
```
docker compose --profile lite|full up -d
```
| 服务 | 镜像 | 内存 | 端口 |
|---|---|---|---|
| postgres | pgvector/pgvector:pg15 | 512MB / 1.5GB | 5432 |
| redis | redis:7-alpine | 128MB / 384MB | 6379 |
| minio | minio/minio | 256MB / 512MB | 9000 |
| xg-backend | Dockerfile.java | 2GB / 4GB | 8080 |
| xg-ai | Dockerfile.python | 512MB / 1GB | 8000 |
| nginx | （前端静态 + 反代）| 64MB / 128MB | 80 / 443 |
| prometheus | （full）| - / 256MB | 9090 |
| grafana | （full）| - / 256MB | 3000 |

### 9.2 关键环境变量
| 类别 | 变量 |
|---|---|
| DB | `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` |
| Redis | `REDIS_HOST` `REDIS_PORT` `REDIS_PASS` |
| MinIO | `MINIO_ENDPOINT` `MINIO_ACCESS_KEY` `MINIO_SECRET_KEY` `MINIO_BUCKET` |
| AI | `AI_SIDECAR_URL` `AI_INTERNAL_TOKEN` |
| LLM | `QWEN_API_KEY/BASE_URL/MODEL` `DEEPSEEK_API_KEY/BASE_URL/MODEL` |
| ASR | `XFYUN_APP_ID` `XFYUN_API_KEY` `XFYUN_API_SECRET` |
| PG 调优 | `PG_SHARED_BUFFERS` `PG_EFFECTIVE_CACHE` `PG_WORK_MEM` |

### 9.3 初次部署
1. `docker compose up -d postgres redis minio`
2. xg-backend 启动 → Flyway 自动跑 public/V001-V006 + tenant 99 个迁移（`TenantMigrationRunner` 按 `tenant.schema_name` 应用）
3. 初始化超管：`platform_admin` 表 seed
4. 创建首个租户 → `POST /api/v1/platform/tenants`（待开发） / SQL insert
5. 启动 xg-ai sidecar → 注入 KB seed（V003 已建表）
6. 部署前端：`pnpm build` → nginx 托管 `apps/web/dist`，小程序通过 Taro CLI 上传到微信开放平台

---

## 10. 数据迁移版本路线图（V001 → V099）

| 阶段 | 迁移区间 | 主题 |
|---|---|---|
| 基线 | V001–V020 | 用户 / 组织 / RBAC / 审计 / 文件 / 通知投递层 / 工作流 / 学生事件 / 预警 / 请假 / 采集 / 考勤 / 学生画像 / 知识 / 工作日志 / 违纪 / 工助 / seed |
| 体验加强 | V021–V050 | 演示数据 / 工作流 module 字段 / 复杂请假 form schema / 投诉删除 / 违纪审批 + 申诉 / 预警噪声治理 / 谈话记录 / 学生事件扩充 / 学历层级 / 学生扩展信息 + 字段定义 / 字段字典 / 销假 v1 / 公示节点 / 请假时长分支 |
| 工助 + 销假完善 | V051–V075 | 节点标签重命名 / 用工单位 + 学年配置 / 学生资助等级 / 工助 v2 + 薪酬流 / 院领导绑定回填 / RBAC employer / 应急联系人 / 学生工助偏好 / 请假提醒 mask / 学期 / 课表 / 学历事件 / 工助演示 / 三大新审批角色 |
| 配置版本化 + 通知中心 + 学籍 | V076–V099 | leave_config base/patch/changelog + leave_request 配置快照 / 节假日 / 班主任 + 学院秘书 seed / 工作流学院域 / leave_v3-v9 全链 / 老配置删除 / 班长角色 seed / 销假改非工作流 + 人工字段 / 学期唯一索引 + 学期累计上限 / 通知中心配置层 + 模板 + 偏好 + care_rule + 双轨去重 / 通用工作流模板 / task_arrived 事件 / 模板接收人映射 / 教师角色 seed / 住宿轨 / 全局请假策略 / duration_days 两位小数 / 是否要求附件 / 工作流变更摘要 |

---

## 11. 已知技术债 / 待办（来自代码注释）

1. **角色码清理**：核心 6 + 老别名 8，UI 仅展示核心，DB 层别名仍生效。计划 P5 数据迁移阶段清理（`RolePermissionDefaults.java` 注释）。
2. **微信订阅消息**：`notification_template.wx_template_id` 留空，等微信开放平台申请模板 ID 后填。
3. **WechatSI 同声传译**：`app.config.ts` 注释掉 plugins，待 mp 后台开通后启用。
4. **ProfileSync**：`field_catalog.target_*` 字段已留位，未启用——字段提交后写回 student_profile 的策略（overwrite / append_history / request）尚未实现。
5. **field_catalog.index_strategy = gin/column**：自动建索引功能（Phase C）未实现。
6. **平台超管租户管理 UI**：`/api/v1/platform/auth/*` 已建，但租户开通 / 续期端点待开发。
7. **AI 工具：Guardrails**：`app/guardrail/` 当前为空（无 PII / prompt injection 检查）。
8. **复杂请假 form schema**：V032 / V033 已扩展，但前端 FormBuilder 对 cascader / date_range 等高级 widget 的支持仍在打磨。

---

## 12. 术语对照

| 术语 | 释义 |
|---|---|
| 朝夕 / XG1 | 产品名 |
| 小夕 | AI 助手 |
| 租户 / Tenant | 一所学校 = 一个 PG schema |
| 角色码 / RoleCode | 14 个之一（核心 6 + 别名 8）|
| leave_v3 | 当前生效的 9 链路请假工作流 |
| Workflow Definition | 工作流定义（YAML / JSON 双存）|
| Workflow Instance | 工作流实例（一次申请）|
| Task Instance | 任务实例（一个审批节点的待办）|
| Field Catalog | 字段字典 → 跨流程复用推荐 |
| Field Definition | 学生画像扩展字段元数据 |
| Workspace Insight | AI 工作台洞察（每天一刷）|
| 双轨通知 | YAML 节点 + Orchestrator 路由两条路径，靠 template_code 唯一索引去重 |
| Term Cap / 学期累计上限 | leave_global_config.term_max_days，租户级单值 |
| 围栏 / Geofence | 校园 GPS 多边形，决定是否自动销假 |
| Sidecar | xg-ai Python FastAPI 进程 |
| Sa-Token | Java 端鉴权框架 |

---

> **本 PRD 与代码同步**——任何字段、状态、端点的口径变更，均以代码为准。修改 PRD 前请先确认 SQL 迁移与 Controller 已上线。
