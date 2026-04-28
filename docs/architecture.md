# 架构入门图谱

> 给团队读的 1-2 页图谱。**这不是设计文档**——它只描述当前代码长什么样，
> 不解释为什么。完整设计见 `总体设计-v2.md` / `P0-功能设计-v2.md`。

## 1. 模块边界

```
xg-backend (Java 17 + Spring Boot 3)
├── xg-common         共用工具：BaseEntity / R / BizException / ErrorCode 接口 / TenantContext
├── xg-platform      平台层：sys_user/role/rbac、workflow 引擎、auth、文件、通知
├── xg-business      业务层：leave / collection / checkin / violation / workstudy / counselor-talk / alert
├── xg-tool-registry 占位（未启用）
└── xg-app           Spring Boot 启动点 + Flyway migrations + application.yml

xg-ai (Python 3.11 + FastAPI)
└── app
    ├── api          chat / insight / agent / tools / health / task_recommendation
    ├── tool         query_tools.py（17 个工具）+ base.py
    ├── llm          DeepSeek / 通义千问 等 provider 适配
    ├── rag          retriever + knowledge formatter
    └── guardrail    输入校验

xg-frontend (pnpm workspace)
├── apps/web         React 18 + Antd 5 + ECharts + react-query + zustand
├── apps/mini        Taro 3.6 + React（小程序，已锁 Node 18-22）
└── packages
    ├── shared       API client、types、utils
    └── design-tokens 共享设计变量
```

**租户隔离**：Schema 级。`MyBatisPlus` 多租户插件 + `TenantContext` 自动路由；
异步任务用 `TenantTaskDecorator` 从 bean 字段重建上下文。

## 2. 工作流（已发布的勤工助学定义）

| ID | code | 流程 | biz_type |
|---|---|---|---|
| 1004 | `workstudy_timesheet_v1` | 用工部门上报 → 学生确认 →（异议）学工部裁定 | `workstudy_timesheet` |
| 1005 | `workstudy_position_v1` v2 | 用工单位发布 → 用人单位领导审核 → 学生处审核 | `workstudy_position` |
| 1006 | `workstudy_apply_v1` v2 | 学生提交 → 岗位负责人审核（dynamic assignee） | `workstudy_application` |
| 1007 | `workstudy_salary_v1` | 用工申报 → 资助中心审批 | `workstudy_salary` |

旧版 1002/1003 已 `status=archived`。`startWorkflowByBizType` 选最高 version+published。

**Assignee 解析**：`BuiltinAssigneeStrategy`（counselor/dean/student/officer）+
`GlobalRoleStrategy`（按 sys_role.code）+ `WorkStudyAssigneeStrategy`
（`employer_leader|same_employer` 走 `employer.leader_user_id`，
`position_owner|same_position` 走 `position.owner_user_id`）。

**终态同步**：业务表的 status 由各模块的 `WorkflowFinishedEvent` 监听器写回。
work-study 监听器位于 `WorkStudyWorkflowListener`，三类 biz_type 都覆盖。

## 3. 核心数据表（勤工助学）

| 表 | 关键字段 | 备注 |
|---|---|---|
| `employer` | name / leader_user_id / operator_user_ids(jsonb) / allow_self_arrange | V051 |
| `work_study_year_setting` | academic_year (UNIQUE) / max_fixed_per_student / max_temp_per_student / application_open | V051 |
| `work_study_position` | + employer_id / academic_year / owner_user_id / campus / time_slots(jsonb) / salary_unit / salary_amount / gender_limit / aid_levels / grade_limits / college_limits / self_arranged | V018 + V030 + V051 |
| `work_study_application` | financial_aid_level / status (pending/hired/rejected) / workflow_instance_id | V018 + V030 |
| `work_study_timesheet` | application_id / month (yyyy-MM) / hours_reported/_confirmed/_final / status | V030 |
| `work_study_salary` | timesheet_id (nullable) / units / unit_type / unit_rate / amount / position_type / status (draft/pending/confirmed/rejected/paid) | V030 + V055 |
| `student_profile` | + aid_level (special/difficult/mild/none) | V053 |

资格预筛位于 `WorkStudyService.isEligible/enforceApplyEligibility`：性别 / 年级 /
学院 / 困难等级 / 名额 / 学年在岗上限。

## 4. AI 工具清单（query_tools.py）

| 工具 | 角色 | 用途 |
|---|---|---|
| `query_leaves` / `query_notifications` / `query_checkins` 等 | 多 | 通用查询 |
| `find_workstudy_positions_by_preference` | student | 自然语言筛岗位 |
| `match_workstudy_positions_to_schedule` | student | 按空余时间匹配 |
| `draft_workstudy_application_intro` | student | 申请理由起草 |
| `summarize_workstudy_applicants` | counselor/dean/admin/officer | 候选人对比卡 |
| `detect_workstudy_salary_anomaly` | aid_center/officer/admin | 薪资异常扫描 |
| `suggest_workstudy_position_template` | counselor/dean/admin/officer | 新岗位模板建议 |
| `workstudy_dashboard_brief` | 全角色 | 按角色分发的总览播报 |

调用入口：
- 走 LLM 路由：`POST /api/v1/chat`（chat.py 让模型决定调谁）
- 直执行：`POST /api/v1/tools/{tool_name}/execute`（绕开 LLM，mini app 用此）

## 5. 前端导航

**Web**：`/work-study` 一个菜单 6 个 tab（总览 / 岗位 / 申请 / 用人单位 / 薪资 /
学年配置），学生只看前 3 个。仪表板含 4 张 ECharts 图。

**Mini**：tabBar 5 项（首页 / 勤工助学 / 我的申请 / 我的薪资），学生侧实际入口。
`AI 帮我写`按钮直调 `/api/v1/tools/draft_.../execute`。

## 6. 测试与 CI

- Java：`./gradlew :xg-business:test`（54 用例，7 个测试类）
- Python：`pytest tests/`（30 用例，1 个文件）
- 前端：`pnpm exec tsc --noEmit`（web/mini）
- 一键：`bash scripts/ci.sh`（含 JAVA_HOME 自动探测）
- CI：`.github/workflows/ci.yml` + `.workflow/ci.yml`（Gitee Go）

## 7. 关键编码红线

1. AI 增强逻辑必须 try-catch，AI 不可用时业务能传统流程兜底
2. 工作流 DSL 表达式受限（`computed` 仅 `duration_days/date_diff/if_then`），
   严禁通用脚本
3. 工具粒度 = 用户任务级，不暴露 user_id 给 Agent；用户身份从 ctx 取
4. 动态表单数据用 PostgreSQL `JSONB + Generated Column`，不引入 ES
5. P0 不引入 RabbitMQ / ClickHouse，能用 PG 解决就 PG
