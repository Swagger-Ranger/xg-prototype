# Progress Log

## Session 2026-04-18 (Phase 1 开工)

### 已确认设计决策
- 事件写入位置：`xg-platform/event/`（跨模块基础设施）
- 发布机制：Spring `ApplicationEventPublisher`（同步 listener，避免 async 的 tenant context 复杂度）
- 错误策略：publisher 层 try-catch，失败只 warn log，不阻塞业务
- Phase 1 只做 5 个集成点，其余延后

### 进度
- [x] 对照设计文档（§3.10 / §3.11）和代码现状
- [x] 创建 task_plan.md / findings.md / progress.md
- [x] Phase 1 代码完成
  - `xg-platform/event/StudentEventType.java`（13 个事件类型）
  - `xg-platform/event/model/StudentEventLog.java`
  - `xg-platform/event/mapper/StudentEventLogMapper.java`
  - `xg-platform/event/StudentEventPublisher.java`（失败静默，不阻塞业务）
  - 5 个集成点：leave.apply（afterCommit）/ checkin.scan / violation.recordViolation / complaint.submit / notification.confirm
- [x] `./gradlew :xg-business:compileJava :xg-platform:compileJava` 通过
- [x] 重启后端 + 冒烟
  - 5/5 事件冒烟通过：`violation_recorded` / `complaint_submitted` / `leave_submit` / `notification_confirmed` / `checkin_late`（late_minutes=13）
  - 顺手修掉 `CheckinService` 三处 insert 漏写 `tenant_id` 的老 bug（scan/rollCall/supplement）
  - 途中修掉的问题：
    - `StudentEventLog.event_data`（jsonb）之前用 `JacksonTypeHandler` 写出 varchar，PG15 拒绝。新增 `xg-common` 的 `JsonbMapTypeHandler`（`Map<String,Object>` → PGobject）并切换。
    - `NotificationService.confirm()` 里做 level/delay 富化时，会命中 `notification.channels`（text[]）被错误用 `JacksonTypeHandler` 反序列化的老 bug。把富化包进 try-catch，失败降级为 level=normal、delay=0，确保事件仍发。
- [x] 提交（`fa8679f feat(backend): student event stream + 5 module integrations`，10 files / +277 -3）

## Session 2026-04-18 (Phase 2 预警引擎)

### 设计
- 5 条内置规则（seed 在 `V023__seed_alert_rules.sql`）：
  1. 请假频繁：30 天内 leave_submit ≥ 5（medium）
  2. 近期违纪：7 天内 violation_recorded ≥ 2（high）
  3. 投诉偏高：14 天内 complaint_submitted ≥ 2（medium）
  4. 迟到模式：14 天内 checkin_late ≥ 3（medium）
  5. 多模块异常：30 天内跨 ≥ 3 种风险事件（critical, composite）
- 去重：`insertIfAbsent(student_id, rule_id, open/acknowledged)`，同一学生同一规则只有 1 个 open 告警
- 调度：`AlertScanScheduler` 每日 02:00 扫描所有 active tenant
- 手动触发：`POST /api/v1/alerts/scan`

### 进度
- [x] Flyway placeholder 修复：`TenantMigrationRunner` 加 `placeholders(Map.of("tenant_id", schemaName.substring(7)))` —— 之前 V020 因 baseline=022 没跑到，V023 才第一次碰到
- [x] 代码：`alert/model/{AlertRule,StudentAlert}`、`alert/mapper/{AlertRuleMapper,StudentAlertMapper}`、`alert/service/StudentAlertService`、`alert/controller/AlertController`、`alert/scheduler/AlertScanScheduler`、`alert/dto/{AlertQueryRequest,AlertActionRequest}`
- [x] `XgApplication` 加 `@EnableScheduling`
- [x] 重启后端，V023 applied=1，`tenant_default.alert_rule` 5 条全部落盘
- [x] 冒烟：
  - `POST /api/v1/alerts/scan` → `inserted=1`（composite 规则 5 命中学生 9001 的 3 种风险事件）
  - `GET /api/v1/alerts` list → 返回 1 条 critical 告警
  - `GET /api/v1/alerts/summary` → `{open_total:1, by_severity:{critical:1}}`
  - `GET /api/v1/alerts/{id}` → 详情 OK
  - `POST /api/v1/alerts/{id}/acknowledge` → status 转 acknowledged
  - `POST /api/v1/alerts/{id}/resolve` → status 转 resolved，resolved_at / note 正确
- [x] 提交 Phase 2（`72e2a36 feat(backend): student alert engine with 5 built-in rules`）

## Session 2026-04-18 (Phase 3 前端)

### 计划（调整）
- Web 前端 `/alerts` 列表页（筛选 + 详情 + ack/resolve）
- 工作台"需关注学生"卡片（open 总数 + critical/high 标注）
- `GET /api/v1/dashboard` 聚合接口：**跳过**。工作台已用 React Query 并行请求，合并成 1 次调用收益微小

### 进度
- [x] `api/alert.ts`（list/summary/detail/ack/resolve/scan）
- [x] `pages/alert/index.tsx` + `index.module.css`（筛选：状态/级别/学生 ID；手动扫描按钮；详情 Drawer 显示 trigger_data JSON；ack/resolve 带备注 Modal）
- [x] `App.tsx` 加 `/alerts` 路由；`NavRail.tsx` 加导航项（`AlertOutlined`，权限 `student:view`）
- [x] `workspace/index.tsx` 把原先 TODO 的"在校学生 —"卡换成"需关注学生"，点击跳 `/alerts`；高危时显示"紧急 N"并变红
- [x] `pnpm --filter @xg1/web typecheck` 通过
- [x] Vite dev server 正常响应 `/alerts`

## Session 2026-04-18 (UI 对齐参考设计)

### 背景
用户反馈："样式还可以 但是效果还没有达到管理端-AI侧边对话布局.html"。对照参考后确认 4 项差距（第五项"字体加载"已在 `index.html` 里搞定，不需要改）。

### 改动
- [x] **body 背景渐变**（`theme/global.css`）：`body::before` 换成 indigo+cyan 径向渐变 blob，`body::after` 保留 dot grid，grain 噪点移到 `#root::after` z-index 9999 避免跟渐变打架
- [x] **NavRail**（`layouts/NavRail.module.css`）：item 36→40px、active 态 gradient+多层 glow、active 指示条 16→20px 高度+线性渐变+glow、hover 弹性 `scale(1.08) cubic-bezier(0.34,1.56,0.64,1)`、rail 右边缘 inset shadow、active 色 `--ac` → `--ac-hi`
- [x] **TopBar**（`layouts/TopBar.tsx` + `.module.css`）：`<h1>` 标题 → 面包屑（学工管理 / 当前路由）、未读 > 0 时显示 mono meta pill（warn dot）、280px 搜索框带 `⌘K` kbd、32×32 gradient 头像（ac-lo→ac→ac-hi）带在线状态绿点、`rgba(246,247,250,0.82) blur(20px) saturate(1.65)` + `inset 1px 顶高光 + 4px 18px 底阴影`
- [x] **Stat cards**（`pages/workspace/index.module.css` + `index.tsx`）：radius r-lg→r、padding 20→16px 18px、head 加 label（mono uppercase）+ 24×24 icon、value 28/700 → 30/600 + tabular-nums + `letter-spacing: -0.04em`、hover 时 `::before` 顶部渐变线 + `::after` 径向 inner glow + icon 变 indigo、底部 8-bar spark（stagger transition-delay 0→126ms，最后一根带 indigo glow）
- [x] `pnpm --filter @xg1/web typecheck` 通过

