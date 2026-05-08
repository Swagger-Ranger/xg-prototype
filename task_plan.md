# Task: 学生行为事件流 + 异常预警引擎（设计文档 §3.10 + §3.11）

## Goal
建立 AI 壁垒的数据层：
1. 各业务模块在关键动作时写 `student_event_log`（事件流水）
2. 规则引擎基于事件流定时扫描，产出 `student_alert`（预警）
3. 辅导员工作台消费预警（卡片、列表、行为时间线）

## Success Criteria
- 请假/签到/违纪/投诉/通知确认 5 个事件点可写入 `student_event_log`
- 5 条内置预警规则可被每日定时任务触发并写入 `student_alert`
- `GET /alerts` / `/alerts/summary` / `/alerts/{id}` / `POST /alerts/{id}/acknowledge` / `/alerts/{id}/resolve` 返回正确数据
- 前端新增 `/alerts` 页 + 工作台"需关注学生"卡

## Phases

### Phase 1: 事件流写入 `status: complete`
- [x] 建立 `StudentEventLog` 实体 + mapper（xg-platform/event）
- [x] 定义 `StudentEventType` 枚举（13 个类型 + 每个 type 带默认 severity 0-10）
- [x] `StudentEventPublisher` bean（tenant 自动带入，失败吞掉不阻塞业务；支持 severity 覆盖）
- [x] 集成点 1: 请假提交 → `leave_submit` (LeaveService.apply)
- [x] 集成点 2: 签到 → `checkin_success` / `checkin_late` (CheckinService)
- [x] 集成点 3: 违纪记录 → `violation_recorded` (ViolationService)
- [x] 集成点 4: 投诉提交 → `complaint_submitted` (ComplaintService)
- [x] 集成点 5: 通知确认 → `notification_confirmed` (NotificationService.markConfirmed)
- [x] V025 migration: 补 `severity SMALLINT` 列 + 部分索引 `WHERE severity >= 5`
- [x] 启动 + 冒烟：stu_zhang 提交请假 → `leave_submit` severity=2 落库（2026-04-18 23:35:57）

**Phase 1 deferred items `status: follow-up complete`:**
- [x] `checkin_absent` — `CheckinService.rollCall` 中检测 `entry.status='absent'` 时发事件（仅新增/首次标记才发）
- [x] `notification_unconfirmed` — 新 `NotificationUnconfirmedScanScheduler`（cron `0 45 1 * * *`，48h 未确认且 require_confirm=TRUE；NOT EXISTS 子查 student_event_log 做幂等）
- [x] `leave_rejected` — 在 `WorkflowEngine` 实例 setStatus("rejected") 后，仅当 `bizType='leave'` 发事件（initiatorId=studentId）
- [x] `leave_cancelled` — `LeaveService.confirmCancel` + `forceCancel` 发事件（source=confirm/force 区分）
- 跳过：`collection_filled/overdue`/`counselor_talk_recorded` — 覆盖不紧急且对应 UI 入口不存在
- [x] 事件查询 API `GET /api/v1/students/{id}/events` — 分页 + `eventType` / `minSeverity` 过滤

### Phase 2: 预警引擎 `status: complete`
- [x] 5 条内置规则 seed（V023：请假频繁 / 近期违纪 / 投诉偏高 / 迟到模式 / 多模块异常）
- [x] `StudentAlertService`（去重、多规则聚合升级）
- [x] `AlertScanScheduler` cron `0 0 2 * * *`
- [x] `/alerts` / `/alerts/summary` / `/alerts/{id}` / `/alerts/{id}/acknowledge|resolve` CRUD API

### Phase 3: 前端 `status: complete`
- [x] `/alerts` 页（列表 + 筛选 + ack/resolve）— 329 行已存在
- [x] 工作台"需关注学生"卡片（在 `CounselorWorkspace` 的 statGrid 中，critical+high 聚合为副标题）
- [x] 学生详情 Drawer 行为时间线 Tab — `components/student/EventTimeline.tsx`（按 severity 着色的 dot，数据以 kv chip 展示）
- 跳过：`GET /api/v1/dashboard` 聚合接口 — 5 个工作台查询已通过 react-query 天然并行；合并收益低，保留现状

---

## Phase 8: 角色化工作台 + Agent 洞察

### 设计决策
- 三角色差异化：学生（发起 + 看结果）/ 辅导员（审批 + 盯异常）/ 院领导（统筹 + 看趋势）
- 学生工作台**不接 LLM**（stat 卡足够；ROI 低）
- 辅导员 + 院领导接 LLM：每日 02:30 定时 + 手动刷新（10 min 冷却）
- scope_key：counselor = user_id；dean = 'global'
- LLM 输出 JSON `[{severity, category, title, detail, suggestion, refs}]`
- 降级：Agent 未生成/过期显示占位，不阻塞其它区块

### Phase 8A: 后端骨架 `status: complete`
- [x] Flyway V024：`workspace_insight` 表（role/scope_key/metrics/insights/status）
- [x] `xg-platform/insight`：model / mapper / service / dto / controller / scheduler
- [x] `GET /api/v1/insights?role=` / `POST /api/v1/insights/refresh?role=`
- [x] `InsightScanScheduler` cron `0 30 2 * * *`（stub，8C 接入指标 + LLM）
- [x] `./gradlew :xg-platform:compileJava` 通过

### Phase 8B: AI sidecar 洞察端点 `status: complete`
- [x] `POST /api/v1/insights`：接收 `{role, scope_key, metrics}`，返 `{model, insights[], error_message}`
- [x] prompt 模板 counselor / dean（SYSTEM_PROMPTS + OUTPUT_CONTRACT）
- [x] 结构化输出解析（`_parse_insights`，容忍 ```json ... ``` 围栏）+ 失败降级为空数组 + error_message
- [x] 冒烟：counselor 返 4 条、dean 返 3 条，severity/category/refs 正确

### Phase 8C: 指标聚合 + 接入 LLM `status: complete`
- [x] `WorkspaceMetricsService.collectForDean()` / `collectForCounselor(userId)` — JdbcTemplate + schema-qualified SQL，12 个 dean 指标 / 7 个 counselor 指标
- [x] `AiSidecarClient.insights(role, scopeKey, metrics)` — RestTemplate, 30s timeout, 失败降级为 `InsightsResult.failure`
- [x] `InsightService.refresh` 真正跑：collect → sidecar → persist（含 metrics/insights/model/status/error_message）
- [x] `InsightScanScheduler` 扩展：dean + 遍历 role_id=2 辅导员（query sys_user_role）
- [x] 手动 refresh 冷却 10 min：Redis `insight:cooldown:{tenant}:{role}:{scope}` + `setIfAbsent` TTL + `INSIGHT_COOLDOWN` BizException
- [x] 冒烟：dean 返 4 条 critical/warn/info 洞察；counselor empty_class 场景降级返 1 条提示；cooldown 二次请求返 "592 秒后再试"

### Phase 8D: 前端 `status: complete`
- [x] 拆 `StudentWorkspace / CounselorWorkspace / DeanWorkspace`（`workspace/index.tsx` 变角色分发器）
- [x] `api/insight.ts` + `components/insight/InsightCard.tsx`（severity 配色 info/warn/critical + 建议 + refs）
- [x] 辅导员：4 张 stat 卡（待审批 / 今日请假 / 未读通知 / 需关注学生）+ 待办 + 最近请假 + AI 洞察
- [x] 院领导：4 张全院 KPI 卡（学生 / 辅导员 / 待审批假 / 未解决预警）+ AI 洞察 + 辅导员工作量 TOP（复用 insight.metrics）
- [x] 手动"重新分析"按钮：`useMutation(refreshInsight)`，成功 toast / 冷却 BizException 走 onError 提示
- [x] typecheck + vite build 通过

## Phase 9: 产品打磨 `status: complete`

> 计划中所有 checkbox 都已 complete，但在实际产品效果层面还有真实薄弱点。逐条补齐。

### 9.1 冷启动 KPI 依赖 LLM 问题
- 原因：`DeanWorkspace` KPI 读的是 `insight.metrics`（JSON 字符串）—首次访问或 cron 未跑时为 null
- [x] 新建 `GET /api/v1/workspace/metrics?role=dean|counselor` 直接读 `WorkspaceMetricsService`，绕过 LLM
- [x] `DeanWorkspace` 从 `getWorkspaceMetrics('dean')` 取数，`InsightCard` 仅显示 AI 文案（分离关注点）
- [x] 冒烟：dean1 登录 → 5 学生 / 1 辅导员 / 9 待审批 / 2 未解决预警 全部实时

### 9.2 手动触发 notification_unconfirmed 扫描
- 原因：只能等 01:45 cron，不利于演示/运维
- [x] `POST /api/v1/events/scan/notification-unconfirmed` 调用 `NotificationUnconfirmedScanScheduler.runOnce("manual")`
- [x] 冒烟：返回 `{emitted: 0}`（当前无 >48h 未确认）

### 9.3 Alert → 学生档案 深链
- 原因：辅导员关注一条预警时，没法一键跳到该学生的行为时间线
- [x] `/alerts` Drawer `extra` 插槽加「查看学生档案」按钮 → `navigate('/student?studentId=xxx&tab=timeline')`
- [x] `/student` 解析 `?studentId=` + `?tab=timeline` 自动打开 Drawer 并切到时间线 Tab
- [x] 关闭 Drawer 时清理 query params（避免历史回退怪异）
- [x] typecheck + vite build 通过

## Phase 10: AI 观察员升级(按吴恩达纪律)

> 对照吴恩达《Agent 实战建议》盘点当前系统 gap:
> - Tool Use: `/chat` 已做,`/insights` **没做** → 只吃 metrics,不会下钻
> - Reflection: 完全未做 → 幻觉无自校验
> - Eval/HITL/流式: 均未做 → 没法迭代
> - refs 字段是自由文本 → 无法做证据校验,前端点不了
>
> 执行顺序(严守 Ng 的 P0→P0.5 纪律):
> 10A 结构化证据 → 10B Insight Agent 工具化下钻 → 10C Reflection 自校验 → 10D HITL 反馈闭环 → 10E Eval + CI

### Phase 10A: 结构化证据 `status: complete`
- 原因:refs 是自由字符串,Reflection 无法校验"引用是否真实存在";前端无法回链
- [x] Python `InsightRef{type, id, label}` 替代 `list[str]`;`field_validator` 容忍遗留字符串格式
- [x] Prompt OUTPUT_CONTRACT 重写:type 枚举(metric/student/alert/counselor),明确禁编 id 规则
- [x] 前端 `InsightCard` 把 refs 渲染为彩色 chip;student 类型可点击跳 `/student?studentId=&tab=timeline`
- [x] 冒烟:dean1 刷新 → 4 条洞察,每条 1-2 个 metric refs,key 路径(如 `alerts_by_severity.critical`)真实存在

### Phase 10B: Insight Agent 工具化下钻 `status: complete`
- 原因:Insight 只吃 metrics 不会下钻。异常时应引用具体学生/诉求 id,而非仅谈 metric key
- [x] `AiSidecarClient.insights` 增加 `user_id`/`user_role`/`tenant_id` 参数,转发给 sidecar
- [x] `InsightService.refresh(role, scopeKey, callerUserId)` 透传调用方身份;Controller 传 header X-User-Id
- [x] `InsightScanScheduler`:dean 扫描用首个 role_id=4 的用户 id;counselor 扫描用 counselor 自己 id
- [x] `application.yml ai.sidecar.timeout` 30s → 60s(工具环多轮需要更长超时)
- [x] `/api/v1/insights` 重写为 1 轮 tool-use agent:`MAX_TOOL_CALLS=3`、`MAX_ITERS=3`,最后一轮强制 `tools=None`
- [x] 工具轮后追加 user 消息提醒"严格按 OUTPUT_CONTRACT 输出 JSON";避免模型出散文
- [x] 复用 `query_tools.execute` + `tools_for_role`,身份从 `InsightRequest.user_id/user_role/tenant_id` 透传
- [x] 冒烟 counselor(empty_class):0 tool_calls, 1 info 洞察, 无异常直出结论
- [x] 冒烟 dean(有 alerts/leave_pending/complaints):1 tool_call(query_complaints), 5 条洞察(critical/warn×3/info),refs 结构化

### Phase 10C: Reflection 自校验 `status: complete`
- 原因:LLM 仍可能编 metric key。需在返回前用程序方式验证 refs 真实性,避免前端点到不存在的指标
- [x] `_flatten_metric_keys`:递归 metrics dict 收集所有点号路径(含中间 key),用于校验集合
- [x] `_reflect`:对每条 insight,剥离所有 `type=metric` 且 id 不在 keys 集合的 refs;若原有 refs 全被剥离则整条丢弃(判定为编造);student/alert/counselor 暂信任
- [x] `InsightItem._normalize_refs` 补 InsightRef 对象直通(消除 latent bug:Python 直接构造时 refs 被吞)
- [x] `generate_insights` 在 `_parse_insights` 后调用 `_reflect`,log 记录 dropped 计数
- [x] 单测:real+fake 混合,3 条 kept(含 1 条仅保留合法 ref),1 条 dropped;dict 路径同样正确
- [x] 冒烟 dean(5 学生/1 critical/9 leave_pending):4 条洞察 dropped=0,refs 全部指向真实 metrics key

### Phase 10D: HITL 反馈闭环 `status: complete`
- 原因:Reflection 只能抓假 id,抓不到「引用真但结论错」。需要真实用户 👍👎 作为 Eval 对齐目标(10E 前置)
- [x] V026 tenant migration:`insight_feedback` 表(tenant_id / insight_id / item_index / user_id / action);`UNIQUE(insight_id, item_index, user_id)` 保证幂等
- [x] `InsightFeedback` model + `InsightFeedbackMapper`(ON CONFLICT DO UPDATE,SUM(CASE) 按 item_index 聚合,listUserVotes 给当前用户)
- [x] `InsightFeedbackService.record / countsByItem / userVotes`,action 非 up/down 抛 `INVALID_ACTION`
- [x] `POST /api/v1/insights/{id}/feedback?itemIndex&action` — 需 X-User-Id,否则抛 `UNAUTHENTICATED`
- [x] `GET /insights` 和 `refresh` 响应扩展 `feedback_counts` + `user_votes`(itemIndex→{up,down} / itemIndex→action)
- [x] 前端 `InsightCard` 每条 insight 底部新增 👍👎 按钮,已投票态高亮(绿/红),乐观更新 react-query 缓存
- [x] `api/insight.ts` 补 `submitInsightFeedback`,类型修正(Long 被全局 ToStringSerializer 序列化为 string)
- [x] 冒烟 dean1:refresh 拿到 id=14 → 投 0↑ + 1↓ + 1↑(替换)→ GET 返 `counts={0:{up:1,down:0},1:{up:1,down:0}}` `user_votes={0:up,1:up}`,DB 2 行符合幂等

### Phase 10E: Eval + CI Gate `status: complete`
- 原因:加了 tool-use / reflection / HITL 后,需要可重复跑的 eval 才能判断后续修改是改善还是退化
- [x] `eval/insight_eval.py`:3 个固定 fixtures(dean_quiet / dean_critical / counselor_empty_class)+ httpx POST 到本地 sidecar
- [x] 4 类断言:JSON 解析 OK / item count 在 [min,max] 区间 / expect_severity 至少一条 / forbid_severity 必须缺席 / metric refs 全部落在 `_flatten_metric_keys` 集合
- [x] 任一 fixture fail 则 exit 1,直接可接 CI;结果按表格打印含 fab ref 归因
- [x] 本地跑 3/3 PASS:quiet→1 info 无 critical;critical→5 条含 critical+2 warn+2 info;empty_class→1 info

## Phase 11: 审批流自定义表单 schema（用户 2026-04-20 提出）

> 设计前提：schema 进 `workflow_definition.config_yaml` 的 `form:` 节点；字段演进规则：允许 ADD / 软 DELETE，禁 RENAME / 类型变更；schema 随 workflow_instance.definition_snapshot 冻结；冷字段 JSONB 查询，热字段 `indexed:true` + 单独 Flyway migration

### Phase 11A: 后端 schema + 通用校验器（试点 leave）`status: complete`
- [x] `FormSchema` / `FormField` model（xg-platform/workflow/form）
- [x] `FormSchema.fromSnapshot` 从 `config_json.form.fields` 解析
- [x] `WorkflowEngine.loadFormSchemaByBizType(bizType)` 供 Service 调用（查最新 published 定义）
- [x] `FormDataValidator`：required / type (string/number/boolean/date) / options / pattern / unknown-field / deprecated warn
- [x] `LeaveService.apply` + `proxyApply` 调 validator，失败抛 `FORM_VALIDATION_FAILED`
- [x] Flyway V032 在 leave_v3 definition 加 demo `form:` 字段（destination/emergency_contact/transportation）
- [x] 5 case 冒烟通过：missing required / unknown field / enum miss / pattern miss 4 路被 `FORM_VALIDATION_FAILED` 拦截；valid 路径 form_data 入库

### Phase 11A+: 扩展到 complaint + workstudy `status: complete`
- [x] V033：complaint/work_study_application 加 `form_data JSONB`；插入 `complaint_v1` 定义（schema-only 载体）；给 `workstudy_apply_v1` 注入 form block
- [x] ComplaintService.submit + WorkStudyService.apply 接 validator
- [x] SubmitComplaintRequest / ApplicationCreateRequest 加 `extraData`；model 加 JsonbTypeHandler 的 formData
- [x] 9/9 冒烟通过（complaint 4 + workstudy 5），form_data 正确入库

### Phase 11B: 前端 DynamicForm 渲染器 `status: complete`
- [x] `components/form/DynamicFormFields.tsx`：useQuery `getFormSchema(bizType)` staleTime 60s；支持 required / pattern / options / type(string/number/boolean/date)；deprecated 字段前端过滤
- [x] 三个申请表单挂载 `<DynamicFormFields bizType="..." fieldNamePrefix={['_extra']} />`：
  - `leave/LeaveApplyModal.tsx` bizType=leave
  - `complaint/index.tsx` bizType=complaint
  - `workStudy/index.tsx` bizType=workstudy_application
- [x] Service 端接 `extra_data`/`extraData` 落 `form_data` JSONB（见 Phase 11A+）
- [x] 端到端：`GET /api/v1/workflows/form-schema?bizType=...` 三种业务类型均返 3 field；leave=destination/emergency_contact/transportation(enum)、complaint=urgency/preferred_contact(enum)/expect_reply_days、workstudy=available_hours(number)/motivation/has_prior_experience(bool)

### Phase 11C: `/workflows` 编辑器 form schema 同 publish `status: via-YAML`
- 现状：workflow 编辑器直接改 `config_yaml`，YAML 里已含 `form:` 节点（V032/V033），DSL 和 schema 同一 publish 周期
- 未做：独立字段级 UI 面板 / YAML form 块语法高亮 — 非阻塞，留作体验优化

### Phase 11D: 热字段索引策略 `status: deferred`
- 现状：`indexed:true` 字段只能通过手写 Flyway migration 建 JSONB generated column + 索引（参考 V032/V033 模式）
- 未做：自动化脚本扫描 form schema 的 indexed 标记 → 生成 migration。延到生产业务验证出"哪个字段真需要索引"后再做（避免过早优化）

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| — | — | — |

## Notes
- 事件写入应用层用 Spring `ApplicationEventPublisher` 解耦。AOP 太重且 pointcut 脆弱
- `TenantContext` 在异步 listener 中需显式恢复（已有 pattern 参考 `TenantMigrationRunner`）
- 所有事件表都是租户 schema 级（V008 在 tenant migration）
