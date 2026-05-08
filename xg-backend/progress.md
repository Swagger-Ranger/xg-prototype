# 异常预警模块重构 - Progress Log

## Session 2026-04-21

### 设计对齐
- 与用户确认了 5 个方向的方案，决策记录在 task_plan.md
- 准备开始 Phase 1（实效性）

### Phase 1 启动
- 开始读 AlertScanScheduler / AlertController / alert 前端页

### Phase 1-4 完成，Phase 5 阻塞
- Phase 1: AlertDevScanScheduler (2 分钟 dev 扫描)，前端"立即扫描"按钮已有
- Phase 2: EventSummaryFormatter + trigger_data.matched_events/explanation/rule_hit + 前端中文展示
- Phase 3: false_positive 状态 + markFalsePositive + listRulesWithStats + 前端"规则运维"tab
- Phase 4: V036 migration（counselor_talk_id, muted_until）+ upsertAlert/refireAcknowledged + mute API + 前端 re_fires 展示
- Phase 5 阻塞：counselor_talk 模块不存在，需用户确认是否要从零构建

### Phase 5 完成
- V037 迁移：counselor_talk 表（tenant/student/counselor/topic/content/follow_up/talk_at/source_alert_id）+ 索引
- 后端 xg-business/counselortalk：Model/Mapper/Controller/Service/DTO/ErrorCode
- StudentAlertService 新增 linkCounselorTalk：写 counselor_talk_id + 状态推到 acknowledged
- CounselorTalkService.create：插入后发布 COUNSELOR_TALK_RECORDED 事件；若带 sourceAlertId 则回写告警
- 前端：api/counselorTalk.ts、pages/counselorTalk（列表 + 新建 Modal + 详情 Drawer，支持 URL 参数预填）
- App.tsx 路由 + NavRail.tsx 菜单项「辅导谈话」(MessageOutlined, worklog:manage 权限)
- 告警详情抽屉新增「发起谈话」按钮（primary），跳转 /counselor-talks?studentId=X&alertId=Y&context=Z
- 前端 tsc --noEmit 通过
- 后端未编译验证：当前环境缺 Java runtime，需用户在自己机器上跑 `./gradlew :xg-business:compileJava` 验证

### Phase 6：AI 观察员班级视角（Option B — 默认聚合 + 班级懒加载）
- WorkspaceMetricsService：抽 `collectCounselorMetrics(counselorId, classId)` 私有入口；公开 `collectForCounselorClass`；classId 非空时走 `classInfoIfManaged`（org_closure 校验管辖）+ `studentIdsOfClass`；未管辖 → `access_denied=true` 短路
- InsightController /api/v1/insights & /refresh：新增可选 `classId`；scope_key 格式 `<userId>:class:<classId>`（VARCHAR(64) 足够）
- InsightService.refresh：兼容旧签名 + 新 4 参签名；从 scope_key 前缀解析 counselorId；classId 非空走班级路径
- 前端 api/insight.ts：getLatestInsight / refreshInsight 接受可选 classId；CounselorMetrics 增加 class_id / class_name / access_denied
- 前端 InsightCard：prop 增加 classId；queryKey 纳入 classId 避免缓存串位；refresh / feedback 同步写回独立 scopeKey
- CounselorWorkspace：classBreakdown 保留 classId；chip 头部新增「AI 分析」按钮 → Drawer 加载独立 scope 的 InsightCard
- 前端 tsc --noEmit 通过
- 后端未编译验证：同样依赖用户本地 `./gradlew :xg-platform:compileJava` 验证
