# W2 规则埋点 Backlog —— 5 条暂不可行规则登记

**版本** v1.0
**日期** 2026-05-16
**关联** `PRD-主动关怀工作台-重写版.md` §9.2 / `docs/W1-信息架构与任务卡.md` §9

PRD §9.2 列了 13 条内置规则。W2.3 实装了**有真实数据流的 8 条**：
R001 / R006 / R007 / R008 / R009 / R011a / R011b / R012。

其余 5 条因底层数据缺失暂不实装（写出来也永不触发 = 死代码）。本文登记**为什么不行 + 解锁需要什么**，rule_id 保留不复用。

---

## 不可行：缺成绩库（P1 工程）

| 规则 | 名称 | 缺什么 | 解锁条件 |
|---|---|---|---|
| R002 | 挂科叠加 | 系统无成绩 / 挂科存储。academic 模块只有学期 + 考试日期 + 课表，无 student_score / grade_record 表 | P1 建成绩库 + 挂科录入入口发 `EXAM_FAILED` 事件 |
| R003 | 阶段成绩下降 ≥15% | 同上，且需要**成绩数值**做趋势对比（不是布尔挂科） | P1 成绩库需存分数 + 至少 2 次阶段记录 |
| R010 | 趋势性下滑（成绩↓+出勤<70%）| 缺成绩数值 + 缺课堂出勤率统计表 | 成绩库 + attendance_record（出勤率聚合）两者都要 |

**结论**：R002/R003/R010 是 P1 成绩子系统的下游，不在 W2 / 主动关怀范围内。`EXAM_FAILED` 枚举已存在（旧 alert 遗留），建库后在成绩录入 service 调 `publishWithSource(EXAM_FAILED, ...)` 即可，规则侧加回 catalog。

---

## 部分可行：缺宿舍查寝子系统（数据源待业务确认）

| 规则 | 名称 | 缺什么 | 解锁条件 |
|---|---|---|---|
| R004 | 晚归异常（14天≥3次）| 无查寝记录表。checkin 模块是课堂签到，非宿舍 | 建 `dorm_check_record` 表 + DormCheckService 发 `DORM_LATE_RETURN` 事件 |
| R005 | 夜不归宿（14天≥2次）| 同上 | 同上，发 `DORM_CHECK_ABSENT`（枚举已存在） |

**阻塞点不是代码，是业务**：宿舍查寝数据现实中从哪来（人工录入？门禁对接？）、谁录入、录入周期 —— 必须先和现场 / 学工确认数据来源，再设计表结构和埋点。residential 框架（org_unit track='residential' / dorm_block）已存在，挂得上。

**解锁步骤**：
1. 业务确认查寝数据来源与录入责权
2. 建 `dorm_check_record` migration + DormCheckService
3. 加 `DORM_LATE_RETURN` 到 StudentEventType（`DORM_CHECK_ABSENT` 已存在）
4. R004/R005 spec 加回 `CareRuleCatalog.RULES`（COUNT_THRESHOLD，复用现有引擎，零引擎改动）

---

## 已实装 8 条的已知近似

| 规则 | 近似点 | 待精化 |
|---|---|---|
| R009 多模块异常 | "≥3 类异常"口径 = distinct `event_source` 且 severity≥4；非 PRD 未明示的精确类目体系 | 若产品要精确类目，定义 event→category 映射表 |
| R011a 勤工纪律离岗 | PRD 条件含 "或 workstudy_no_show≥2"，但 no_show 无调度器未埋点（PRD §8.2 已允许 P1 缺）；当前只认 discipline 离岗（severity≥7）| 补 workstudy no-show 调度器后加回子条件 |
| R012 隐性经济压力 | "无成功上岗"无对应事件，当前只判"30天被拒≥3次" | 补 `workstudy_onboarded` 事件后加 `AND NOT EXISTS` 过滤 |

---

## 解锁后如何加回规则（零引擎改动验证）

新规则若是"窗口内某类事件计数"型，只需在 `CareRuleCatalog.RULES` 加一行 `RuleSpec(..., COUNT_THRESHOLD, ...)`，
引擎 / scheduler / 去重 / 派单全部复用。这是 W2.3 把规则做成**配置而非 per-rule 类**的核心收益。
特例型（类似 R008/R009）才需要在 `CareRuleEngine` 加分支。

---

## 状态复核（2026-05-17，截至 W6 完成）

本 backlog 仍**全量有效**：W3-W6 未新增成绩库、未建查寝子系统，5 条规则的解锁条件无一满足。
内置规则维持 **8/13 实装**（R001/R006/R007/R008/R009/R011a/R011b/R012），R002/R003/R010/R004/R005
继续挂起，rule_id 保留不复用。解锁动作不在主动关怀 P1 范围，归 P1 成绩子系统 / 业务确认查寝数据源后再回。
完成态登记见 `PRD-主动关怀工作台-重写版.md` §18.2。
