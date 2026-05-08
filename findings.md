# Findings

## DB schema (tenant)

### student_event_log (V008)
- Append-only，无 deleted_at
- `event_type VARCHAR(32)`, `event_source VARCHAR(32)`, `event_data JSONB`
- `occurred_at` 为业务时间；`created_at` 为落库时间
- 索引：`(tenant_id, student_id)`, `(event_type)`, `(occurred_at DESC)`, 30 天过滤偏索引

### alert_rule (V009)
- `rule_type`: frequency / consecutive / composite
- `config JSONB`: e.g. `{"event_type": "leave_submit", "window_days": 30, "threshold": 5}`
- `severity`: low / medium / high / critical
- 系统内置规则 `tenant_id = 'system'`（按设计 §3.11.2）

### student_alert (V009)
- `status`: open / acknowledged / resolved / dismissed
- `trigger_data JSONB` 存证据摘要
- 同学生同规则 open 只存一条（需插入前去重）

> **与设计不完全一致的地方**：V009 里 `alert_rule` 没有 `code`、`event_type`、`is_system` 列；有 `rule_type` 和 `config`。设计 §3.11.2 写的字段 `code` / `event_type` / `condition_json` / `level` / `is_system` 实际都塞进了 `config` 或 `rule_type`。目前 Phase 1 用不到 `alert_rule` 表，Phase 2 再决定是否加列。

## 现有代码 pattern 参考

### Tenant context propagation
- `xg-common/tenant/TenantContext` — ThreadLocal, `current()` 返回当前租户
- `TenantSchemaInterceptor` 在每次 SQL 执行前 `SET search_path`
- 异步场景（定时任务、ApplicationEventListener async）必须 `TenantContext.set(...)` 然后 `clear()`

### BaseEntity
- `com.xg.common.base.BaseEntity`：`id`, `tenantId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`
- Snowflake ID 通过 `MetaObjectHandlerImpl` 自动填充

### Mapper pattern
- MyBatis-Plus `BaseMapper<T>` 通常 extends，配合 `@TableName(value="...", autoResultMap=true)`
- JSONB 字段用 `typeHandler = JacksonTypeHandler.class`

### 模块位置
- 业务模块（用户可见功能）：`xg-backend/xg-business/src/main/java/com/xg/business/{module}/`
- 平台底座（跨模块基础设施）：`xg-backend/xg-platform/src/main/java/com/xg/platform/{module}/`
- **结论**：事件流 + 预警引擎属于跨模块基础设施，放 `xg-platform/event` 和 `xg-platform/alert`

## API/Controller conventions
- 所有 REST 路径 `/api/v1/{resource}`
- `@RequestHeader("X-User-Id")` 拿当前用户 ID
- 返回 `R<T>` 或 `R<PageResult<T>>`
- 分页参数通过 `PageQuery` / 自定义 DTO 继承之，`@Validated`

## 事件发布方案
- 用 Spring `ApplicationEventPublisher` 在 Service 里 publish
- 同步 listener（避免 async 带来的 tenant context 复杂度），listener 只做"写一条记录"
- 写 student_event_log 失败不能影响主业务，在 publisher 层 try-catch

## 路由设计陷阱（2026-04-19）
- 后端**未引入** `spring-boot-devtools`；改 Controller 后必须重启 `bootRun`，`compileJava` 不会热更
- `/api/v1/students/{id}`（StudentController）会把任何字面量当成 `Long id`，所以 `/api/v1/students/top-late` 会被它吃掉抛 NumberFormatException
  - 解决：**新端点不要挂在 `/api/v1/students/` 下**。用 `/api/v1/student-stats/top-late` 之类隔离前缀
- Java 后端日志在 `/private/tmp/xg_app.log`；GlobalExceptionHandler 会把异常吞成 `{code:"INTERNAL_ERROR"}`，必须看日志才能知道真因

## 今日简报 + 数据概览合并（2026-04-19）
- `TodayBriefCard` 扩展出三层：`summary`（自然语言总结）+ `stats`（紧凑 4 列迷你卡）+ `items`（原提醒项）
- 原 `styles.statGrid` + "数据概览" section label 从 CounselorWorkspace/StudentWorkspace 移除，所有数据合并进一张卡
- summary 用 `<em className="warn|danger|success">` 着色关键数字；CSS 侧通过 `em:global(.warn)` 让 CSS module 放行裸 className
- index.module.css 里的 `.statCard / .statGrid / .statValue...` 目前只剩兼容，未再引用，暂不删以保 diff 最小

## 工作流引擎 Step 1（2026-04-19 写入请销假真实流）
- 先前 `workflow_definition` 表是空的，`LeaveService.startWorkflowSafely` 的 `try-catch` 一直吞掉 `WORKFLOW_DEFINITION_NOT_FOUND`，所以请假看似"走了"但 `workflow_instance` 没一行
- `WorkflowController.createDefinition` 之前漏写 `config_json`，直接调 API 创建必然插入失败（`config_json JSONB NOT NULL`），只能靠 Flyway 种子跑起来
- `AssigneeResolver` 之前 stub 返回 `List.of()`，`ApprovalExecutor` 看到空列表不建 task，workflow 就卡在 `counselor_approval` 节点
- **改动**
  - V029 种子 `leave_v2` 定义（published，version=1）：start → counselor_approval → duration_check → (>3 天) college_approval → approved；含 `rejected_next` 到 `rejected` 端节点
  - 新增 `AssigneeLookupMapper.findCounselorsOfStudent / findDeansOfStudent`，走 `student_profile → org_closure → counselor_org_mapping/sys_user_role(role=4)`
  - `AssigneeResolver` 改为查 Mapper，目前支持 `counselor+same_class` 和 `dean+same_college`；其他组合返回空
  - `PUT /definitions/{id}` 语义改为"插入新 draft 版本 (version+1)"，不再原地改写；旧实例靠 `definition_snapshot` 锁版本不受影响
  - 新增 `POST /definitions/{id}/publish`：把目标版本置 published，同 code 其他 published 降为 disabled
  - `POST /definitions` 现在会用 SnakeYAML 解析 `configYaml` → `config_json`（否则 insert 必定违反 NOT NULL）
- **验证路径**：重启 bootRun → 学生 2011 提交 2 天请假 → 应产生 `workflow_instance` + `task_instance(assigneeId=2001)` → 辅导员 `/tasks/pending?assigneeId=2001` 可看到
- **已知 gap**：duration_days > 3 的流程会进 `college_approval`，但 demo 数据里没 seed dean 用户；这类请假目前会在 college 节点挂起无任务。留给 Step 2/5 处理（seed + dean 解析已实装但没人可派）

## 工作流引擎 Step 2（2026-04-20 勤工助学 3 个流程）
- V030 同时做 DDL + seed：`work_study_position` / `work_study_application` 加 `workflow_instance_id`；新建 `work_study_timesheet` / `work_study_salary`；seed 3 个 workflow definition（id=1002/1003/1004）
- 约定：`workstudy_timesheet_v1` 的 `initiator_id` = **student_id**（即使 API 由用工部门调用），这样 `student+self` 分支可直接返回 `[initiatorId]`，避免给 ApprovalExecutor 加 `from_context` 能力
- `AssigneeResolver` 新增 2 个分支：`student_affairs_officer+global`（查全校 role_id=5）、`student+self`（返回 `[initiatorId]`）；对应 `AssigneeLookupMapper.findStudentAffairsOfficers`
- `WorkStudyService` 三个入口动作全部改走工作流，biz.status 在 Service 层根据节点 + 动作同步回写（引擎本身不回写 biz 表）：
  - `createPosition` → `pending_approval` + 启 1002；`decidePosition` → open/closed
  - `apply` → `pending` + 启 1003；`decideApplication` 根据当前 `task.nodeId` 决定 action：counselor_recommend → recommended；officer_hire → hired（同时 position.hired_count++，满员自动 closed）；任何节点 reject → rejected
  - `reportTimesheet` → `pending_confirm` + 启 1004；`studentConfirm` → confirmed + hours_final=hours_reported；`dispute` → disputed；`finalize` → finalized + hours_final=req.hoursFinal
- 冒烟通过：position 2045914820025360386（pending_approval → open）/ application 2045914996026744834（pending → recommended → hired）/ timesheet 2045915063563427842（pending_confirm → disputed → finalized 40h）
- 已知简化：
  - `check_hourly_rate` condition 节点没做（设计文档有），用 Service 层校验 hourly_rate 就够
  - notification 节点全部省略（不影响流程推进，后续 Step 需要时再加）
  - 盘口 demo 数据里只有一个 officer（2103），所以"officer"角色任务永远分给同一人；多 officer 情况下多个 task 并行，谁先抢谁做

## 工作流引擎 Step 3（2026-04-20 去 code 硬编码）
- 目标：Service 层不再写 `"leave_v2"` / `"workstudy_position_v1"` 等字面量，换定义无需改 Java
- **V031**：`workflow_definition` 加 `biz_type VARCHAR(64)` + `idx_wf_def_biz_type_status`；为 id=1001/1002/1003/1004 回填 `leave / workstudy_position / workstudy_application / workstudy_timesheet`
- `WorkflowDefinition.bizType` 字段；`WorkflowController` create/update/list 全部透传 + 支持 `?bizType=` 过滤
- `WorkflowEngine.startWorkflowByBizType(bizType, initiatorId, bizId, formData, aiDraft)`：按 `biz_type + status=published + version desc` 选定义，复用 `startWithDefinition` 公共部分；老 `startWorkflow(code, ...)` 保留给定义调试/管理员手动触发
- Service 层 4 处改动：`LeaveService.startWorkflowSafely` / `WorkStudyService.createPosition|apply|reportTimesheet`，一律改走 bizType API
- **效果**：后续 admin/agent 只需 `POST /definitions` 带 biz_type + `POST /definitions/{id}/publish`，老版本自动降为 disabled，下次业务调用即用新版——零 yml、零重启
- 冒烟：leave inst=2046017396523765762（biz_type='leave' → 命中 leave_v2，task 落到 counselor 2001）；position inst=2046017676518723586（biz_type='workstudy_position' → 命中 workstudy_position_v1）

## 工作流引擎 Step 4（2026-04-20 后台 UI + 关键补漏）
- **前端新页** `/workflows`（挂 NavRail 底部，仅 `system:manage` 权限）：
  - `apps/web/src/pages/workflow/index.tsx` + `.module.css`
  - 列表：按 code / biz_type / status 过滤；列 = code + name + biz_type (Tag) + module + version + status + updated_at + 操作
  - 三个 Modal：新建（code/name/bizType[AutoComplete]/module/configYaml[textarea]） / 编辑（保存即新建 v+1 草稿） / 查看（只读 YAML）
  - 发布按钮带 Modal.confirm 提示"同 biz_type 旧版自动降为停用 + 在跑实例靠快照不受影响"
- `api/workflow.ts` 补 `listDefinitions / getDefinition / createDefinition / updateDefinition / publishDefinition` + 对应 payload 类型
- `packages/shared/src/types/workflow.ts` 补 `WorkflowDefinition / WorkflowDefinitionStatus`
- NavRail 新增 `ApartmentOutlined → /workflows`（bottom items，紧邻系统管理）
- **Step 3 遗漏 bug 同步修掉**：`WorkflowController.publishDefinition` demote 之前只按 `code` 匹配，改为 `code OR biz_type` 并集—否则 admin 用新 code 发同一 biz_type 时老版本不会下线，`startWorkflowByBizType` 两个都 published 时选谁靠数据库物理顺序，undefined behavior
- **端到端验证（2026-04-20 08:37）**：
  1. `POST /definitions` 创建 `leave_v3` (draft, biz_type=leave) → id=2046022099252908033 ✓
  2. `POST /definitions/{id}/publish` → leave_v3 published，**leave_v2 自动降为 disabled** ✓
  3. 学生 2011 新提交请假 → workflow_instance.definition_id 指向 leave_v3 ✓（整条链跑通：admin 改定义 → 业务下一笔即用新版，零重启、零 yml、零 Service 代码改动）
- 跳过的 scope（下次需要再加）：mermaid 节点图预览 / Monaco 编辑器 / 实例监控页（/workflows/instances）

## 工作流引擎 Step 6（2026-04-20 发起人 RBAC）
- 目标：DSL 里声明"谁能发起这个流程"，后端引擎强制校验；管理员 UI 本身已只对 school_admin 可见，学生端自然看不到配置入口
- **DSL 扩展**（向后兼容、可选）：workflow 顶层加
  ```yaml
  initiator:
    roles: [school_admin]  # sys_role.code 数组
  ```
  缺省 = 任何已登录用户可发起（老定义继续工作）
- **引擎校验**：`WorkflowEngine.startWithDefinition` 首步调 `enforceInitiatorRole(snapshot, initiatorId)`——读 `snapshot.initiator.roles`，通过 `AssigneeLookupMapper.findRoleCodesByUserId` 查 `sys_user_role ⨝ sys_role` 拿调用方角色集合，两边无交集抛 `WORKFLOW_INITIATOR_FORBIDDEN` 带允许角色列表
- **前端已有的防线**（Step 4 做的，本次确认）：`NavRail.tsx` `/workflows` 菜单项 `permission: 'system:manage'`；`sys_role_permission` 里只有 `school_admin` 绑了 `system:manage`——学生/辅导员/dean 登录后 menu 不显示
- **冒烟验证（2026-04-20 09:40-09:45）**：
  1. 向后兼容：student 2011 提交请假（leave_v3 无 initiator.roles）→ 成功创建 inst=2046041376903241730 ✓
  2. 允许路径：admin1 (school_admin, 2104) 启动 `test_smoke_global_v1` v3（含 `initiator.roles:[school_admin]`）→ inst=2046042364288540674 ✓
  3. 拒绝路径：student 2011 启动同一定义 → `code=WORKFLOW_INITIATOR_FORBIDDEN` `"当前角色无权发起该流程，允许角色：[school_admin]"` ✓
  4. 前端防线：stu_zhang 登录响应 `role_codes=['student']` 且 `permissions` 不含 `system:manage` → /workflows 菜单隐藏 ✓
- **Step 6 follow-up（2026-04-20 10:00 关掉后台接口直调缺口）**：
  - `WorkflowController` create/update/publish 三个写入口加 `@RequestHeader X-User-Id` + `requireDefinitionAdmin(userId)` → `AssigneeLookupMapper.findRoleCodesByUserId` 查角色，非 `school_admin` 抛 `BizException("FORBIDDEN", ...)`；GET 列表 / 详情保持开放（业务方调用 + UI 列表都需要）
  - `WorkStudyController` `/salary/settle` 加同款守卫，允许 `student_affairs_officer` 或 `school_admin`（`Set<String> SALARY_OPS_ROLES`）——之前学生拿 token 能直接调，虽然 NOT EXISTS 幂等没实际后果，但涉钱接口不该暴露
  - 冒烟：stu_zhang `POST /definitions` → `FORBIDDEN`；stu_zhang `GET /definitions` 仍 200；admin1 `POST /definitions` → SUCCESS；stu_zhang `POST /salary/settle` → `FORBIDDEN`；officer1 → SUCCESS ✓
  - 这是"Controller 层内联 role guard"风格的最小落地；sa-token 在项目里依旧没接管，后续若需全站统一 RBAC 再迁到切面/拦截器

## 勤工助学 Step 7（2026-04-20 工资结算调度）
- 目标：`work_study_timesheet` 走到 `confirmed` / `finalized` 后自动生成对应 `work_study_salary` 行，不依赖辅导员/学工处手工触发
- **新增**：
  - `WorkStudySettlementMapper.findSettleableTimesheets`：`timesheet ⨝ position` + `status IN (confirmed, finalized) AND hours_final IS NOT NULL` + `NOT EXISTS` salary — 返回含 timesheet_id/student_id/position_id/month/hours_final/hourly_rate 的候选集
  - `WorkStudySalarySettlementService`：逐行插入 `WorkStudySalary{hours=hours_final, hourly_rate=position.hourly_rate 快照, amount=hours*rate (HALF_UP scale 2), status='pending'}`，`DuplicateKeyException` 吞掉（竞争 / 重试兜底）；`runOnce(source)` 遍历 `public.tenant` active 租户（复用 `AlertScanScheduler` 模式）
  - `WorkStudySalaryScheduler`：`@Scheduled(cron="0 0 3 * * *")` 晚于 02:00 alert 扫描，让当日结算的 timesheet 进入
  - `POST /api/v1/work-study/salary/settle`：手动触发，返回插入行数（运维 / 演示 / agent 走）
- 幂等保障两层：SQL `NOT EXISTS` 预筛 + DB 层 `uq_ws_salary_timesheet` 部分唯一索引（`WHERE deleted_at IS NULL`）兜底
- **Rate snapshot 设计**：`hourly_rate` 在结算时读 position 当前值并写入 salary 行；后续 position 调整时薪不会倒追改已结算金额
- **冒烟验证（2026-04-20 09:24）**：
  1. 首次手动触发 → `data=1`；DB 行：timesheet_id=2045915063563427842, student_id=2011, month=2026-04, hours=40.0, rate=18.50, **amount=740.00** ✓（`hours_final=40` × `position.hourly_rate=18.50`）
  2. 二次手动触发 → `data=0`，salary 行仍为 1 行（幂等 ✓）

## 工作流引擎 Step 5（2026-04-20 AssigneeResolver 策略化）
- 目标：去掉 `AssigneeResolver` 的 `switch(role+"|"+scope)` 硬编码，admin 在 `sys_role` 新增角色后直接能在 YAML 里 `scope: global` 引用，零 Java 改动
- **接口** `AssigneeStrategy`：`supports(role, scope)` + `resolve(role, scope, initiatorId)`
- **两个 Bean + `@Order` 竞价**：
  - `BuiltinAssigneeStrategy`（`@Order(100)`）：`Set.of("counselor|same_class","dean|same_college","student_affairs_officer|global","student|self")` 走原来 mapper 路径，保住历史行为
  - `GlobalRoleStrategy`（`@Order(1000)`）：`supports = "global".equals(scope)`，调 `findUsersByRoleCode(role)` 按 `sys_role.code` 反查用户。兜底在后——`counselor+same_class` 这类特化仍走 Builtin，不会退化成"全租户 counselor"
- **新 Mapper 查询** `AssigneeLookupMapper.findUsersByRoleCode`：`sys_user_role ⨝ sys_role(code=?) ⨝ sys_user(active)` DISTINCT + ORDER BY user_id
- `AssigneeResolver` 改为 `List<AssigneeStrategy>` 注入后按 `@Order` 顺序首个 `supports` 命中即返回，无策略匹配时打 `warn` 并返回空列表（原行为一致）
- **冒烟验证（2026-04-20 09:02-09:03）**：
  1. 回归：学生 2011 新请假 inst=2046031641235808257 → task 落到 counselor_li (2001)，`counselor+same_class` 走 Builtin 分支 ✓
  2. 新能力：创建 `test_smoke_global_v1`（`role: school_admin, scope: global`）+ publish + start → inst=2046032039036182529，task assignee=admin1 (2104)，**唯一持有 `sys_role.code='school_admin'` 的用户**，无 Java 改动 ✓

## 学生姓名一致性修复（2026-04-20）
- 起因：5 个表（`leave_request`/`complaint`/`violation_record`/`punishment`/`work_study_application`）有 denormalized `student_name` 列，里面混着 `Unknown`/`stu_zhang`/`Wang Lihua`/mojibake（`å¼ ä¸\u0089` = 张三；UTF-8 被当 Latin-1 写入）
- 根因 2 条：
  1. Controller 信任客户端 — 4 个入口都 `@RequestHeader("X-User-Name", defaultValue="Unknown")`；`ViolationController` 从 DTO body 取 `studentName`
  2. 12 行幽灵数据：`student_id` ∈ {1, 1001, 9001} 没对应 `sys_user` 记录（test smoke 垃圾）
- 修复
  - 5 个 Service 注入 `SysUserMapper`，写入时按 `studentId` 查 `sys_user.real_name`；命中不到抛 `STUDENT_NOT_FOUND`（violation 的 recorder/issuer 同法处理）
  - 4 个 Controller 删 `X-User-Name` header；`ViolationCreateRequest` / `PunishmentCreateRequest` 删 `studentName @NotBlank` 字段（Service 不再读）
  - 一次性 SQL：DELETE 幽灵行（student_id NOT IN sys_user）→ UPDATE `student_name = u.real_name` JOIN 回填；recorder_name / issuer_name / handler_name 同法回填
- 冒烟：
  - stu_zhang 2011 发请假（不传 X-User-Name）→ `student_name=张晓明` ✓
  - stu_zhang 2011 发投诉 → `student_name=张晓明` ✓
  - X-User-Id=99999 发请假 → `STUDENT_NOT_FOUND` ✓
  - counselor_li 给王丽华(2012)记违纪 → `student_name=王丽华`, `recorder_name=李老师` ✓
- 最终一致性：`SELECT ... WHERE stored <> sys_user.real_name` 零行

## 审批流自定义表单 Phase 11A（2026-04-20）
- 决策：form schema 嵌在 `workflow_definition.config_yaml`（不单独建表）；字段放在顶层 `form.fields: []`；版本跟随 definition（instance 仍靠 `definition_snapshot` 锁）
- 演进规则：ADD 任意字段/软 `deprecated:true` 随意；RENAME / 改 type 禁 —— DB JSONB 里历史实例的旧 key 仍要能读
- 字段 schema：`name, label, type, required, options[], indexed, deprecated, placeholder, pattern`；type 支持 string/number/boolean/date（其他类型跳过校验仅警告）
- 实现三件套：`FormField` / `FormSchema(fromSnapshot)` / `FormDataValidator(@Component)`，位置 `xg-platform/workflow/form`
- 接入：`WorkflowEngine.loadFormSchemaByBizType(bizType)` 查最新 published 定义 → `LeaveService.apply/proxyApply` validate 前 `req.getExtraData()`，失败抛 `BizException("FORM_VALIDATION_FAILED", ...)`
- V032 demo：leave_v3 加 destination (required string) / emergency_contact (required + pattern 手机号) / transportation (optional enum[train/flight/bus/other])
- 5 case 冒烟：missing destination → "字段 目的地(destination) 必填"；unknown foo → "字段 foo 不在表单 schema 中"；transportation=teleport → enum 报错；emergency_contact=12345 → pattern 报错；valid payload → 入库 form_data JSONB 完整
- 踩坑：Jackson 用 SNAKE_CASE → curl body 必须 `leave_type_code` / `extra_data`；tenant 依赖 `X-Tenant-Id` header（TenantFilter），否则 BaseEntity.tenantId 为 null insert 会 NOT NULL 崩溃（不是 validator 问题，和之前一致）

## 自定义表单扩展到 complaint + workstudy（2026-04-20）
- 目标：让"schema-driven 表单 + validator 拦截"有跨模块的可见效果，不只限 leave
- V033 迁移：
  - `complaint` + `work_study_application` 两张表加 `form_data JSONB`
  - 插入 `complaint_v1` workflow_definition（biz_type=complaint）— schema-only 载体（start→end，不跑审批），只借 `workflow_definition.config_json.form` 字段挂 schema
  - 给 `workstudy_apply_v1` 通过 `jsonb_set` 补 `form:` block
- Service 接入：
  - `ComplaintService.submit`: `workflowEngine.loadFormSchemaByBizType("complaint") → validator.validate(req.getExtraData())`，通过后 `toJson(extraData)` 写入 `complaint.form_data`
  - `WorkStudyService.apply`: 同 pattern，bizType='workstudy_application'，写入 `work_study_application.form_data`
- DTO：`SubmitComplaintRequest` / `ApplicationCreateRequest` 各加 `Map<String,Object> extraData`；model 对应字段用 `JsonbTypeHandler` + String
- 冒烟验证（全绿）：
  - complaint 4/4：missing urgency / unknown foo / enum miss / valid → form_data 入库 `{"urgency":"medium","preferred_contact":"email","expect_reply_days":5}`
  - workstudy 5/5：missing motivation / unknown foo / 布尔类型错 / 数字类型错 / valid → form_data 入库 `{"motivation":"...","has_prior_experience":false,"available_hours_per_week":12}`
- 设计观察：`complaint_v1` 没有审批节点，但塞进 `workflow_definition` 作 schema 载体是权衡——不想为"只有表单的业务"单建一张 form_schema 表（否则 schema 的版本/发布/租户隔离要再抄一遍），`loadFormSchemaByBizType` 天然走通。如果后续 complaint 要走审批，同一份 `workflow_definition` 直接往 `nodes:` 里加节点就行，不用搬家
- 留空：violation / punishment / workstudy position + timesheet 是工作人员填的强结构数据，字段已稳定，不强行抽象

## AI 观察员 evidence 规范（2026-04-19 重做）
- evidence 必须是**辅导员能看懂的自然中文**，含"时间窗口 + 范围 + 具体数字"三要素
- 禁止 `query_xxx()` / `metrics.xxx` 这种技术串
- 涉及"N 名迟到学生具体是谁"必须调 `query_late_students`，不许据事件总次数猜人数
- `query_late_students` → `GET /api/v1/student-stats/top-late?days=&limit=`（counselor/dean/school_admin）
