# Task Plan: P0 学工管理系统 Web 端

## Goal
为学工管理系统 Web 端实现角色区分、核心 P0 功能、全面质量保障。

---

## Phase 1: 权限基础设施 `status: complete`
- [x] useAuth hook (hasPermission/hasRole/isStudent/isCounselor/isDean/isAdmin)
- [x] NavRail 按权限过滤导航项
- [x] 工作台角色分视图

## Phase 2: 请假模块角色分视图 `status: complete`
- [x] 学生视图：我的请假 + 撤回/销假
- [x] 辅导员视图：班级请假管理
- [x] 角色条件渲染 columns/tabs/queries

## Phase 3: 通知模块完善 `status: complete`
- [x] 辅导员发送通知 Modal
- [x] 页面标题按角色切换

## Phase 4: AI 助手角色感知 `status: complete`
- [x] 前端发送 user_role + user_name
- [x] 后端 system prompt 角色注入 + 工具过滤
- [x] 快捷入口 + suggestion chips 按角色切换
- [x] 知识问答整合进 AI 助手（移除独立页面）

## Phase 5: 全面审查 & 修复 `status: complete`
- [x] 四方审查（产品经理/研发总监/测试专家/设计师）
- [x] 后端 Critical：API Key 泄露、SQL 注入、cancelLeave 状态、表达式引擎、CORS
- [x] 前端 API 对接：checkin/collection 路径、AI Panel 鉴权、workflow assigneeId
- [x] Mutation 错误处理：15 个 onError、8 个 Modal.confirm、权限守卫
- [x] CSS/设计：focus-visible、login 颜色、actionLink 区域、404 路由

## Phase 6: 功能页面实现 `status: complete`
- [x] 接诉即办（学生提交/列表/评价 + 辅导员受理/回复）
- [x] 学生信息（搜索筛选表格 + 详情抽屉）
- [x] 系统管理（用户CRUD + 角色 + 重置密码 + 启禁用）
- [x] 知识问答合并到 AI 助手（移除独立路由和导航）

## Phase 7: 后端剩余修复 `status: complete`
- [x] classLeaves 添加 counselorId 过滤
- [x] forceCancel 限制状态为 approved/cancel_pending
- [x] BizException 返回 HTTP 400
- [x] WorkflowEngine 递归深度限制 100
- [x] 硬编码 186 学生数 → 占位符
- [x] NavRail 重复图标 → checkin 改 ClockCircleOutlined
- [x] LeaveDetailDrawer form_data 中文标签
- [x] checkin 内联 style → CSS module
- [x] collection 进度列 → 显示 "—"
- [x] ProgressDrawer student_name fallback

## Phase 8: AI Sidecar — RAG MVP `status: complete`
- [x] 放弃向量检索（pgvector 未装 + QWEN_API_KEY 为空），改用"全文档直塞 system prompt"策略
- [x] `app/rag/knowledge.py`：2 份种子制度文（请假办法 / 奖学金办法）+ 关键词路由 + 动词前缀过滤（避免"帮我请假"误命中）
- [x] `chat.py` 命中 RAG 时注入文档并强制"只基于资料回答，未覆盖说明确"
- [x] Response 增加 `citations` 字段；`AIPanel.tsx` 气泡下渲染《文档标题》chip
- [x] Smoke：请假天数/奖学金/晚归 → 有引用；谈恋爱（资料外）→ 如实拒答

## Phase 9: AI Sidecar — 只读查询工具 + 单步 Agent Loop `status: complete`
- [x] `app/tool/query_tools.py`：`query_my_leaves / query_my_notifications / query_pending_approvals`（带 `trust_env=False` 绕开全局 HTTP_PROXY）
- [x] `chat.py` 新增两步循环：tool_call → 执行 → 二次 LLM 调用生成自然语言答案
- [x] 前端 `AIPanel.tsx` 在 chat fetch 附 `X-User-Id` / `X-Tenant-Id`（让 sidecar 转发给 Java）
- [x] 学生角色过滤掉 `query_pending_approvals`
- [x] Smoke：学生查请假/未读通知、辅导员查待审批、知识 Q&A 仍走 RAG、投诉仍走开表单

## Phase 10: AI Sidecar — 多步 Agent Loop `status: complete`
- [x] `AnthropicProvider` 新增 `chat_native(system, messages, tools)` + `AnthropicTurn/AnthropicToolUse` dataclass — 返回结构化 content blocks（含 tool_use_id），可原样回塞下一轮
- [x] `chat.py` 改 while-loop（MAX_ITERS=5）：
  - UI 工具（`open_*_form / navigate`）一旦出现立即 break 发 action
  - 所有 tool_use 均为 `query_*` 时：echo assistant 块 + 构造 `tool_result` 块数组，继续循环
  - 无 tool_use 时退出并返回文本
  - `citations` 仅在全程未触发工具时附带（避免"问事实调工具"却挂制度引用）
  - 空文本兜底加 `reply.strip()` 判断，否则 `_action_reply` 不生效
- [x] Smoke 6 条全绿：
  - T1 奖学金 RAG（citations 正确）
  - T2 query_my_leaves 单工具
  - T3 query_pending_approvals 单工具
  - T4 投诉进入三步流程（只返回确认文本）
  - T5 **"请假记录+未读通知一起查"** → LLM 在单轮并行发两个 tool_use，loop 收集两个 tool_result，第二轮合并成一段自然语言（真正的多工具单轮）
  - T6 navigate 直出 action + `_action_reply` 兜底文案

## Phase 13: pgvector 生产化 `status: complete`
- [x] `deploy/docker-compose.yml`: `postgres:15-alpine` → `pgvector/pgvector:pg15`；命名卷保留，`tenant_default` schema 和业务数据不丢
- [x] `CREATE EXTENSION vector` 启用 pgvector 0.8.2（init-db 脚本已有条件建法，老卷手动跑一次）
- [x] sidecar 装 `sentence-transformers + torch + asyncpg + pgvector`
- [x] `app/rag/embedder.py`：`SentenceTransformer("BAAI/bge-small-zh-v1.5")` 懒加载单例；`embed_query` 自动加 bge instruction prefix
- [x] `app/rag/store.py`：`knowledge_chunk` 表（`vector(512)` + HNSW cosine 索引）；asyncpg pool + pgvector type registration；`fetch_similar` 异常捕获返 [] 让上层降级
- [x] `app/rag/ingest.py`：CLI 把 49 篇 article 一次 embed + upsert
- [x] `app/rag/retriever.py`：命令式查询先过 `_looks_like_command` 拦截；embed → pgvector → 距离阈值 0.60 过 OOV；pgvector 空/异常时 fallback 到 keyword
- [x] `app/api/chat.py` 切 `retrieve_semantic`；`citations` 契约不变
- [x] 阈值校准：in-corpus hits 0.31-0.55 / OOV queries ≥0.61，0.60 卡位干净（"谈恋爱/推荐一本书/今天天气" 全拦）
- [x] eval 三方对比（keyword / in-memory semantic / live pgvector）全跑通，pgvector 指标与 semantic 完全一致（Hit@1 0.900 / MRR 0.940 / Hit@5 1.000）
- [x] 坑：eval 里 `asyncio.run` 每次新建 loop 会让模块级 asyncpg pool 失效，改为共享 `new_event_loop()` + `run_until_complete`

## Phase 12: RAG 检索质量评估（keyword vs semantic）`status: complete`
- [x] `eval/rag_eval.py`：30 条手写中文 query + gold article_id 集合，覆盖 6 份制度文
- [x] `eval/rag_semantic.py`：bge-small-zh-v1.5 (sentence-transformers, 512 维, L2 归一化)；in-memory numpy 余弦
- [x] 独立 eval venv `/tmp/xg_rag_eval_venv`（torch CPU + st + numpy），不污染 sidecar
- [x] 并排跑出 Hit@K / P@K / R@K / MRR
- [x] 语义全面胜出：Hit@1 0.533→0.900（+37pt）、MRR 0.659→0.940（+28pt）、Recall@5 0.844→1.000
- [x] keyword 的 4 条硬 miss（"本科最多读几年/晚上访客/奖学金流程/取消资格"）semantic 全修
- [x] 决策：上 pgvector 生产化（Phase 13）

## Phase 14: 统一查询 Tool 注册表（Wave A）`status: complete`
- [x] `query_tools.py` 重构：3 个零参 tool → 5 个 scope 参数化 tool
  - `query_leaves(scope: my/class/uncancelled, status?)` — 合并原 my_leaves + pending_approvals，新增 uncancelled
  - `query_notifications()` — 原 my_notifications 改名（实际就是"我的通知"）
  - `query_checkins(activity_id?)` — 新增（辅导员用）
  - `query_collections(form_id?)` — 新增（辅导员用）
  - `query_complaints(scope: my/handling, status?)` — 新增
- [x] `allowed_roles` 元数据：每个 tool 的 scope → 角色集合映射；`is_role_allowed` 运行时二次校验
- [x] `tools_for_role(role)` 导出角色可见清单；chat.py 从 `UI_TOOLS + query_tools.tools_for_role(role)` 组装
- [x] chat.py 去掉硬编码"学生过滤 open_checkin_form / open_collection_form / query_pending_approvals"的 if-chain
- [x] UI_TOOLS 声明 `allowed_roles` 字段：open_checkin/collection 限 counselor+，其他不限
- [x] Smoke 10/10：学生 5（my-leaves/notif/complaints-my/RAG/open-leave）+ 辅导员 5（class/uncancelled/checkins/collections/complaints-handling）
- [x] 坑：
  - `/api/v1/leaves/uncancelled` 响应形状与其他列表一致 `{data: {data:[], total}}`，最初按"裸数组"解，抛 AttributeError；加 `page/size` 参数后同构修好
  - `/api/v1/complaints/my` 和 `/api/v1/complaints` Java 侧 500（与本 Phase 无关，记录到 findings）；handler 已优雅降级为"系统错误，请稍后重试"
  - smoke 脚本默认走 HTTP_PROXY 导致"Server disconnected"，加 `trust_env=False` 修复（与 query_tools 用的一样招）

## Phase 15: 统一统计 Tool（Wave B）`status: complete`
- [x] `query_stats(metric, date_range?)` — 辅导员/管理员专用
  - `metric=leaves`：调用真 stats 端点 `/api/v1/leaves/stats` with `startDate/endDate`（唯一支持日期过滤的 metric）
  - `metric=complaints/checkins/collections`：后端无专用 stats 端点，按 status 分桶拉 list 端点，用 `data.length` 计数
- [x] 日期范围 enum：`today/this_week/this_month/this_year/all`，默认 `this_month`
- [x] Smoke 12/12（新增 C-stats-leaves、C-stats-cmpl）；`C-stats-cmpl` 正确返 "3 条（审批中 2、处理中 1）"
- [x] 坑：`PageResult.total` 被 Long→String 序列化且经常返 "0"（MyBatis-Plus pagination interceptor 没装），**total 字段不可信**；stats 端用 `data.length` 计数绕开
- [x] P0 里 spec 的 6 个 stats tool 里，只合并了 4 个现有模块；`query_violation_stats` / `query_work_study_stats` 因后端模块缺失延到 Wave C；`query_dashboard_summary` 因聚合端点不存在暂未实现

## Phase 16: 统一查询 Tool（Wave C — 工作日志 / 违纪 / 勤工助学）`status: complete`
- [x] `query_work_logs(category?, date_range?)` — 辅导员/管理员看自己的工作日志
- [x] `query_violations(scope: recent/student, student_id?, category?)` — 违纪列表 + 指定学生 punishments
- [x] `query_work_study(scope: positions/my_applications, prefer_financial_aid?)` — 在招岗位 / 我的申请
- [x] 每个 tool 的 `allowed_roles` 元数据按 scope 精细化（positions 对 student 放开；my_applications 仅 student）
- [x] Smoke 通过（chat 路径端到端）：
  - counselor 问"最近一周工作日志" → `query_work_logs` → 空数据降级文案
  - counselor 问"最近班里有谁违纪" → `query_violations scope=recent` → 返王丽华 2026-04-20 考勤违纪
  - student 问"优先资助生的在招岗位" → `query_work_study scope=positions prefer_financial_aid=true` → 2 个图书馆助理岗
  - student 问"我自己申请的勤工助学" → `query_work_study scope=my_applications` → 无申请降级文案

## Phase 17: 审批风险分级 + AI 叙事 `status: complete`
- [x] Phase A 规则引擎：`PendingTaskEnricher` 批量补齐申请人画像（30天旷课 / 30天请假 / open alerts / 违纪），按 unpunishedViolations / critical+high alerts / absent30d / duration 规则评 low/medium/high
- [x] `GET /workflows/tasks/pending-enriched` 返 `PendingTaskVO(riskLevel, reasons, applicantStats, leave_*)`
- [x] 前端 `QuickApprovalList.tsx`：风险 Tag + reasons 摘要，low-risk 支持"一键通过"批量审批；点开展开详情含判定依据 + 请假信息 + 学生历史
- [x] Phase B AI 叙事：Python sidecar `/api/v1/task-recommendation` 用 DeepSeek 生成 `{recommendation, headline, rationale, checkpoints[]}`，LLM 失败返空 recommendation + error_message 降级
- [x] Java `AiSidecarClient.taskRecommendation` + `EnrichedTaskController.aiRecommendation` 代理
- [x] 前端 `AiRecommendationBlock` 仅对 medium/high 风险 + 展开时懒加载（`staleTime=5min`），按 recommendation 上色
- [x] 端到端冒烟通过：张晓明（medium，30天请假10次）→ caution + headline "请假频繁，建议谨慎审批" + 3 条 checkpoint；low-risk 不触发 LLM

## Phase 11: AI Sidecar — RAG 扩库 + 条款级检索 `status: complete`
- [x] 语料扩充：2 → 6 份制度文（新增 学籍管理 / 违纪处分 / 经济困难资助 / 宿舍管理）
- [x] 每份文档按 `第X条` 自动切条，共 49 篇 article；`ALL_ARTICLES` 在 module load 时生成
- [x] 检索改成"文章级 top-K"：doc-level gate + 跨 doc 关键字池化 + 加权密度打分
  - heading 命中权重 3×，body 命中权重 1×
  - 得分除以 max(40, len(body_ex_heading))，让短而准的条款（如《违纪》第六条）盖过碰巧多次提到关键字的长条款
  - 跨 doc 池化：query 同时触发 DISCIPLINE 与 SCHOLARSHIP 时，`处分与评奖评优` 这种跨主题条款能两边加分
- [x] 命令识别收紧：拆成 `_STRONG_ACTION_PREFIXES`（始终算命令）+ `_WEAK_INTENT_PREFIXES`（需要配一个 booking 动词），让"我想休学半年"进 RAG 而"我想请假"走预填流程
- [x] `format_context` 按 parent doc 分组渲染，便于 LLM 引用 `《文档标题》第X条`
- [x] `chat.py` citations 改成"对 articles 按 doc_id 去重"，对前端契约无感
- [x] Smoke 9 条全绿：
  - P11-1 奖学金金额（精确到 1500）
  - P11-2 休学办法 / P11-3 家庭经济困难 / P11-4 宿舍熄灯 / P11-6 考试作弊 — 各自命中主文档
  - P11-5 跨文档"被处分还能评奖学金吗" → 正确引用《违纪处分》第六条 + 关联《奖学金》
  - P11-7 资料外问题（谈恋爱）拒答
  - P11-8 "帮我请假"不触发 RAG / P11-9 query 工具非回归

---

## Current State
- TypeScript: 0 errors
- 总修复: 3 Critical + 15 High + 11 Medium = 29 项
- 新增功能页面: 3 个（接诉即办、学生信息、系统管理）
- 知识问答已整合进 AI 助手
- 所有占位页面已替换为完整功能实现

## Files Created/Modified
### New Files
- `src/hooks/useAuth.ts`
- `src/api/complaint.ts`
- `src/api/student.ts`
- `src/api/knowledge.ts`
- `src/api/system.ts`
- `src/api/workflow.ts`
- `src/pages/system/index.tsx` + CSS

### Modified Files
- `src/App.tsx` — ProtectedRoute/LoginRoute/404/routes
- `src/layouts/NavRail.tsx` — 权限过滤、图标修复
- `src/layouts/TopBar.tsx` — logout/通知角标/个人设置
- `src/layouts/AppLayout.tsx`
- `src/pages/workspace/index.tsx` — 角色分视图
- `src/pages/leave/index.tsx` — 角色分视图 + 确认弹窗 + 错误处理
- `src/pages/leave/LeaveApplyModal.tsx` — try-catch + onError
- `src/pages/leave/LeaveDetailDrawer.tsx` — 中文标签 + invalidate myLeaves
- `src/pages/notification/index.tsx` — null guard + onError
- `src/pages/collection/index.tsx` — 路径修复 + 确认弹窗 + 进度列
- `src/pages/collection/ProgressDrawer.tsx` — student_name fallback
- `src/pages/checkin/index.tsx` — CSS 变量 + CSS module
- `src/pages/checkin/CreateActivityModal.tsx` — try-catch + onError
- `src/pages/checkin/ActivityDetailDrawer.tsx` — 确认弹窗 + onError
- `src/pages/complaint/index.tsx` — 完整功能实现
- `src/pages/student/index.tsx` — 完整功能实现
- `src/components/ai/AIPanel.tsx` — 鉴权 + 知识问答整合
- `src/theme/global.css` — focus-visible
- `src/pages/login/index.module.css` — CSS 变量替换
- Backend: config.py, chat.py, main.py, TenantSchemaInterceptor, LeaveService, ExpressionEvaluator, GlobalExceptionHandler, WorkflowEngine

### Session 3 — AI Sidecar 改造（Phase 8-9）
- **新建**
  - `xg-ai/app/rag/knowledge.py` — 2 份种子制度文 + 关键词路由
  - `xg-ai/app/tool/query_tools.py` — 3 个只读查询工具
- **修改**
  - `xg-ai/app/api/chat.py` — RAG 注入 + citations 字段 + 单步 agent loop（query_* tool）
  - `xg-frontend/apps/web/src/components/ai/AIPanel.tsx` — citations chip + X-User-Id/X-Tenant-Id headers + open_complaint_form 路由
  - `xg-frontend/apps/web/src/components/ai/AIPanel.module.css` — citations 样式
  - `xg-frontend/apps/web/src/pages/complaint/index.tsx` — 响应 `open_complaint_form` 预填弹窗

## Key Constraints
- 不引入新依赖，用现有 antd + zustand + react-query
- 权限检查只在前端做显隐，后端已有权限拦截
- 保持现有页面结构，增量修改
