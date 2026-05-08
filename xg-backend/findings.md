# 异常预警模块重构 - Findings

## 已知模块文件

### 后端
- `xg-platform/src/main/java/com/xg/platform/alert/model/AlertRule.java` — 规则元数据 (name, rule_type, JSONB config, severity, enabled)
- `xg-platform/src/main/java/com/xg/platform/alert/model/StudentAlert.java` — 发出的告警 (student_id, alert_rule_id, severity, trigger_data JSONB, status=open/acknowledged/resolved, acknowledged_by/at, resolved_at, note)
- `xg-platform/src/main/java/com/xg/platform/alert/engine/AlertRuleEngine.java` — evaluate(dsl) 执行聚合 + 条件 + AI 过滤/严重度钩子
- `xg-platform/src/main/java/com/xg/platform/alert/scheduler/AlertScanScheduler.java` — daily 02:00 cron + runOnce(source)
- `xg-platform/src/main/java/com/xg/platform/alert/service/StudentAlertService.java` — 三种规则类型 frequency/composite/dsl；insertIfAbsent 只对 open 去重；hasRecentResolved 冷却；severity 优先级：AI hook > DSL severity int > rule.severity

### 前端
- `xg-frontend/apps/web/src/pages/alert/` — 告警页（未读）

### 种子数据
- 规则 1: 请假频繁 (frequency, medium)
- 规则 2: 近期违纪 (frequency, high)
- 规则 4: 迟到模式 (frequency, medium)
- 规则 5: 多模块异常 (composite, critical)

## 待探索
- counselor_talk 模块接口（Phase 5 时再探）
- 前端 alert 页面结构
- AlertController 是否存在

## Schema 注意
- student_alert.trigger_data 是 JSONB，加字段无需迁移
- student_alert.status 目前是枚举/字符串，加 false_positive 可能需要检查约束
- student_alert 需要新增：counselor_talk_id (nullable bigint), muted_until (nullable timestamp)
