# 异常预警模块重构 Task Plan

## Goal
重构 student_alert 异常预警模块，解决 5 个痛点：实效性、噪声治理、可解释性、打通 counselor_talk、规则运维。

## User-confirmed decisions
- **实效性**：开发期 2 分钟扫描 + 前端「立即扫描」按钮
- **噪声治理 - 命中升级**：ack 后再命中 → 拉回原行 + 追加证据，不新增
- **规则运维**：新增 `false_positive` status，counselor 和 dean 都可以标
- **counselor_talk 打通**：中等档位 — 按钮跳转 + 谈话保存后回写 counselor_talk_id 并 ack 告警；**不** 自动 resolve

## Phases

### Phase 1 — 实效性 (IN_PROGRESS)
- [ ] Scheduler 增加 dev 快扫（2 分钟）
- [ ] 后端暴露 `POST /api/v1/alerts/scan` 手动扫描接口
- [ ] 前端告警页加「立即扫描」按钮
- verify: 在前端点按钮能实时看到新告警

### Phase 2 — 可解释性
- [ ] Flyway 迁移：不需改表（trigger_data 已经是 JSONB）
- [ ] AggregationExecutor 保留 sample_event_ids
- [ ] 新增 EventSummaryFormatter（按 event_type 生成中文摘要）
- [ ] 引擎产出 `trigger_data.matched_events[]` + `explanation` + `rule_hit`
- [ ] 前端告警详情展示 explanation + matched_events 列表
- verify: 打开一条告警能看到"近30天累计迟到 X 次，最近..."

### Phase 3 — 规则运维
- [ ] student_alert.status 允许 `false_positive`
- [ ] 前端详情抽屉加「标记误报」按钮
- [ ] 后端 POST /api/v1/alerts/{id}/false-positive 接口
- [ ] 后端 GET /api/v1/alert-rules/stats 聚合接口
- [ ] 前端规则管理页展示每条规则的 fires_30d/acks/false_positives/误报率/ack延迟/last_fired
- verify: 标记一条误报后，在规则列表能看到误报率上升

### Phase 4 — 噪声治理
- [ ] StudentAlertService.insertIfAbsent 跨 open + acknowledged 去重
- [ ] 命中升级：ack 告警再命中 → trigger_data.re_fires[] 追加 + status 拉回 open + acknowledged_by/at 清空
- [ ] 按严重度抑制：low/medium 24h 内对同学生聚合成 1 条
- [ ] student_alert 增 muted_until 字段 + 静音 API
- verify: ack 后第二次扫到同条件不产生新行，原行状态回到 open

### Phase 5 — counselor_talk 打通
- [ ] 探 counselor_talk 模块现状（先 read-only）
- [ ] student_alert 增 counselor_talk_id 字段
- [ ] 告警详情「发起谈话」按钮 → 跳转 counselor_talk 新建页带 student_id + 告警摘要
- [ ] counselor_talk 保存后回写 student_alert.counselor_talk_id 并把 status 推到 acknowledged
- verify: 从告警发起谈话 → 保存 → 回到告警列表看状态变 acknowledged

### Phase 7 — AI 写规则（NL → DSL，独立 Modal，不走 AIPanel）
决策：独立 Modal + 直连 sidecar `alert_rule_author` agent；不注入 history/page/modal/pinnedRefs；一次生成，想改重来
前提：AI sidecar `alert_rule_author` agent 已实现；`AlertRuleDsl.nlSource` 字段已留位；`alert_rule.config` 是 JSONB 已存整份 DSL
- [x] Java 新端点 `POST /api/v1/alert/rule/author`，body `{nl}`，调 `AiSidecarClient.invokeAgent("alert_rule_author", {}, {nl})`，返回 `{dsl, attempts, error_message}`
- [x] 端点成功后 pipe 一次 `AlertRuleValidator.validate(dsl)`，一起返给前端做红线提示
- [x] DSL 保存时 `nl_source` 写入 `alert_rule.config.nl_source`（复用 JSONB，不加列不改表）
- [x] 前端 `api/alert.ts` 增 `authorAlertRule(nl)` / `previewAlertRule(dsl)` / `createAlertRule(dsl)`
- [x] 前端新增 `AIRuleAuthorModal.tsx`：左半幅 textarea + 示例 tag + 「生成」；右半幅 DSL JSON + 校验徽章 + 「试算」（命中学生表格）+ 「保存为规则」
- [x] Java 新增 `POST /api/v1/alert/rules` — DSL → AlertRule 落库（rule_type=dsl, severity int→label, tenant 自动填充）
- [x] 规则管理页头部按钮 `✨ AI 写规则` → 打开 Modal
- [x] 修 preview 端点：`AlertRuleEngine.preview` 加 `@Transactional(readOnly=true)` + 显式 `SET search_path` — raw `NamedParameterJdbcTemplate` 不经过 MyBatis `TenantSchemaInterceptor`，HTTP 路径首次调用无 search_path
- [ ] 可选：AIPanel 底部常驻入口「✨ AI 写预警规则」，点了也开同一个 Modal（为了给"AI 助手"心智入口）
- verify: 输入"30 天内迟到超过 5 次的学生，中等预警" → 生成合法 DSL (`ok=true, validation.valid=true`) → 试算返回 `valid=true` → 保存返回 `ok=true, id=2046769795710337025` → stats 接口能看到新行 `rule_type=dsl severity=medium` ✓

## Implementation order
1 → 2 → 3 → 4 → 5（逐阶段推进，每阶段完成前端+后端+验证）
