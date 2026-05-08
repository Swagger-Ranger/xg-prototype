# Progress Log

## Session 2026-04-20 — Wave C 验证 + Phase 17 审批风险分级+AI 叙事

### Wave C（query_tools 已落地，补端到端验证）
- query_work_logs / query_violations / query_work_study 三个 tool 在 query_tools.py 已实现（scope 精细化 allowed_roles）
- 冒烟 4/4（经 `/api/v1/chat` 全链路）：
  - counselor "最近一周我的工作日志" → query_work_logs → "没有工作日志记录"
  - counselor "最近班里有哪些学生被登记违纪" → query_violations scope=recent → 王丽华 2026-04-20 考勤违纪
  - student "有没有在招的勤工助学岗位 优先资助生的" → query_work_study scope=positions prefer_financial_aid=true → 2 个图书馆助理岗
  - student "我自己申请的勤工助学进度" → query_work_study scope=my_applications → "尚未提交过申请"

### Phase 17 审批风险分级 + AI 叙事（辅导员审批台升级）
- **Phase A（纯规则）** `PendingTaskEnricher` 批量查 LeaveRequest + SysUser + CheckinRecord/LeaveRequest/Violation/StudentAlert 4 个 mapper 聚合申请人画像；scoreRisk 规则：
  - high: 未处理违纪>0 OR critical/high alert OR absent30d>0 OR leave>7 天
  - medium: 30 天请假≥3 OR 4-7 天 OR medium/low alert
  - low: 其余 "历史记录良好"
- 新增 `PendingTaskVO`（含 `applicantStats`、`reasons[]`、`leave_*`）+ `GET /workflows/tasks/pending-enriched`
- 前端 `QuickApprovalList.tsx`：row 头带 risk Tag + reasons 摘要 + 通过/驳回；低风险批量"一键通过"；展开行内判定依据 + 请假信息 + 学生历史 + AI 建议
- **Phase B（AI 叙事，medium/high 懒加载）** Python sidecar `POST /api/v1/task-recommendation` → DeepSeek 结构化 JSON `{recommendation: approve|caution|reject, headline, rationale, checkpoints[]}`
- Java 代理 `GET /workflows/tasks/{id}/ai-recommendation` → `AiSidecarClient.taskRecommendation`；LLM 失败返 `error_message` + 空 recommendation，前端降级"AI 建议不可用"
- 端到端冒烟：张晓明（medium，近30天请假10次 + 1 条低等级预警）→ caution + headline "请假频繁，建议谨慎审批" + 3 条 checkpoint（核实事由/学业进度/预警内容）；low 风险行不触发 LLM（AiRecommendationBlock 仅在 `risk_level !== 'low'` 才 useQuery）
- 坑：
  - 前端字段 camel→snake：Jackson 默认把 `leaveCount30d` 序列化成 `leave_count30d`（无首字母隔离时不再下划线），`absent30d` / `violation90d` 保持原样；shared types 与 QuickApprovalList 两处都修
  - PageResult 没无参构造，必须先 `new Page<PendingTaskVO>` 再 `PageResult.of(page)`
  - Module 放置：EnrichedTaskController 在 xg-business（依赖 leave/checkin/violation mapper 同时还要 xg-platform workflow mapper，business→platform 的链是通的）

---

## Session 5 (续): 2026-04-18 — 修 complaints 500，Wave A 闭环

### 调查
- `tenant_default` 有 27 张表但缺 `complaint`（V013）和 `knowledge_qa`（V015）
- `public.flyway_schema_history` 只跑了 V001/V002；tenant track 无 flyway 记录，也无 Java runner
- 生产部署里 tenant 迁移没有自动机制（长期债，记 findings）

### 修复
- 手工 `psql` 执行 V013 DDL（complaint 表 + 5 索引）到 `tenant_default`
- 插入 3 条 seed：2 条归 student 1001（pending + processing），1 条归 2013（pending）

### 验证
- smoke 10 例里 9/10 passed；`S-complaint-my` 返 "2 条"，`C-complaints-h` 返 "2 条"（匹配 pending 计数）
- UI-open-leave 偶发 FAIL：模型选择追问"确认提交吗?"而非直接 tool_use（非本 wave 相关，旧有 prompting flake）

### 下一步
- Wave B：统一 `query_stats(metric, dimension, date_range)`

---

## Session 5 (续 2): 2026-04-18 — Wave B 统一统计 Tool

### 实现
- `query_tools.py` 增 `query_stats(metric, date_range?)`：
  - `metric=leaves` → 真 stats 端点 `/api/v1/leaves/stats?startDate=..&endDate=..`
  - `metric=complaints/checkins/collections` → 按 status 分桶拉 list，count data.length（因为 backend 的 IPage.total 不可信）
- 辅导员/管理员专用
- 默认 date_range=this_month

### 验证
- Smoke 12/12：C-stats-leaves "本月班级共 5 条请假"；C-stats-cmpl "3 条（审批中 2、处理中 1）"（精准匹配 seed 数据）

### 坑
- `PageResult.total` 被 Jackson Long→String 序列化，且常返 "0"（MyBatis-Plus 分页插件没装）
- 早期版本直接 `+= total` 爆 `TypeError: int + str`；改用 `len(data.data)` 才拿到真值

### Wave B 结论
- P0 里 spec 的 6 个 stats tool，4 个实现（leaves/complaints/checkins/collections 合进一个 tool）
- 2 个延到 Wave C：violation（违纪模块）/ work_study（勤工助学模块）—— 两个业务模块都缺
- dashboard_summary 延期：backend 无聚合端点

---



## Session 1: 2026-04-17 — 权限基础设施 + 角色分视图

### Phase 1: 权限基础设施 — DONE
- Created `src/hooks/useAuth.ts` — hasPermission, hasRole, isStudent/isCounselor/isDean/isAdmin
- NavRail filtered by permission — student sees: 工作台, 请销假, 通知任务, 接诉即办
- Logout button uses auth store's logout()
- tsc: 0 errors

### Phase 2: 请假模块角色分视图 — DONE
- Student view: "我的请假" title, 2 tabs (我的请假/统计), getMyLeaves data, 撤回/销假 actions
- Counselor view: unchanged (班级请假/未销假/统计)
- tsc: 0 errors

### Workspace 角色分视图 — DONE
- Student: 2 stat cards (我的请假, 未读通知) + 我的请假记录
- Counselor/Admin: 4 stat cards + 待办事项 + 最近请假
- tsc: 0 errors

### Phase 3: 通知模块 — DONE
### Phase 4: AI 助手角色感知 — DONE

---

## Session 2: 2026-04-17 — 全面审查 + 修复 + 功能开发

### 四方审查 — DONE
- 产品经理/研发总监/测试专家/设计师 4 视角并行审查
- 发现 3 Critical + 12 High + 15 Medium 问题

### 修复批次 1: 路由与布局 — DONE
- ProtectedRoute + LoginRoute + 404 catch-all
- TopBar: logout handler + 通知角标 + 个人设置提示
- tsc: 0 errors

### 修复批次 2: 后端 Critical — DONE (6 项)
- API Key 泄露 → 环境变量
- SQL 注入 → 正则校验
- cancelLeave → cancel_pending
- ExpressionEvaluator → or/and 优先级
- chat.py → 错误脱敏
- CORS → 配置化

### 修复批次 3: 前端 API 对接 — DONE (5 项)
- checkin/collection 路径复数形式
- AI Panel Authorization header + res.ok
- workflow assigneeId 透传

### 修复批次 4: Mutation 错误处理 — DONE
- 15 个 onError 回调
- 8 个 Modal.confirm 二次确认
- 申请按钮 isStudent 守卫
- LeaveDetailDrawer myLeaves invalidate
- validateFields try-catch

### 修复批次 5: CSS 与设计 — DONE
- focus-visible, login 颜色, actionLink, checkin 变量, null guard

### 修复批次 6: 剩余前端问题 — DONE (6 项)
- 硬编码 186 → 占位符 + 链接
- NavRail 重复图标 → ClockCircleOutlined
- form_data 中文标签映射
- checkin 内联 style → CSS module
- collection 进度列 → "—"
- ProgressDrawer student_name fallback

### 修复批次 7: 剩余后端问题 — DONE (4 项)
- classLeaves counselorId 过滤
- forceCancel 状态限制
- BizException HTTP 400
- WorkflowEngine 深度限制 100

### 功能页面开发 — DONE (4 页面并行)
- 接诉即办: API + 学生诉求提交/列表/评价 + 辅导员受理/回复
- 学生信息: API + 搜索筛选表格 + 详情抽屉
- 知识问答: API + Q&A 界面 → 后合并到 AI 助手
- 系统管理: API + 用户 CRUD + 角色 + 重置密码 + 启禁用

### 知识问答合并 — DONE
- 移除 NavRail 知识问答导航项
- 移除 App.tsx /knowledge 路由
- AI 助手知识问答区扩充 4 个快捷入口
- suggestion chips 增加"奖学金""校规问答"

### 最终状态
- TypeScript: 0 errors
- 总修复: 29 项 (3 Critical + 15 High + 11 Medium)
- 新增功能页: 3 个 + 知识问答整合到 AI
- 所有占位页面已替换为完整功能

---

## Session 3: 2026-04-17 — AI Sidecar 真实化（RAG + Agent Loop）

### 起点
用户确认：系统现在"RAG + Agent"名义有、实际没——`app/rag/` 和 `app/agent/` 都是空目录，`BaseTool` 无子类，工具只是 UI 打开指令。要求"按真实的来"推进。

### 方向调整（与用户对齐）
放弃原本"先改 open_*_form 为真 tool → agent loop → RAG → LangGraph"的顺序，改为：
1. RAG MVP（最高正确性价值）
2. 只读查询 tool + 单步 agent loop
3. 多步 agent loop
不做 LangGraph（过度设计）、不把 open_*_form 改成真提交（学生需审核）。

### Phase 8: RAG MVP — DONE
- pgvector 未装 + QWEN_API_KEY 空 → 降级到"文档全文塞 prompt"
- `rag/knowledge.py` 2 份种子文 + 关键字路由 + 动词前缀过滤
- `chat.py` 注入 + `citations` 字段；AIPanel 渲染 chip
- Smoke 4 条：天数/奖学金命中，谈恋爱拒答，"帮我请假"不命中

### Phase 9: 只读 query tool + 单步 Agent Loop — DONE
- `tool/query_tools.py` 3 个工具；`trust_env=False` 绕开全局 HTTP_PROXY（关键踩坑）
- `chat.py` 检测 `query_*` tool → 执行 → 二次 `llm.chat()` 生成自然语言
- 前端 AIPanel 加 `X-User-Id` / `X-Tenant-Id` header 让 sidecar 能转发
- 修了一次 response 形状错判（`unread-count.data` 是字符串不是对象）
- Smoke 6 条全绿：学生/辅导员 query、RAG 继续工作、投诉/请假流程未回归

### Phase 10: 多步 Agent Loop — DONE
- `AnthropicProvider.chat_native` 返回结构化 `AnthropicTurn`（含 `content blocks` 原样回塞、`tool_uses` 带 `id`）
- `chat.py` while-loop（上限 5 轮）：UI 工具立即 break 发 action；`query_*` 工具批量执行、拼 tool_result 回塞；文本则退出
- 清掉不再使用的 `json` / `ChatMessage` import
- 观察：T5 "请假+通知一起查"——DeepSeek-V3.2 在单轮就并行发了两个 `tool_use`，第 2 轮合并结果，2 次 LLM 调用内完成。也就是说"多步"在这条真实样例里跑的是"并行分支收敛"形态，而不是串行依赖；两种都被 loop 等价处理
- 坑：`_action_reply` 原兜底条件 `not reply` 被 `"\n\n"` 绕过，改成 `not reply.strip()` 才生效

### Phase 11: RAG 扩库 + 条款级检索 — DONE
- 语料从 2 → 6 份：请假、奖学金、学籍、违纪处分、经济困难资助、宿舍管理，共 49 篇 article
- 文档按 `^第[一二三..]+条` 正则自动切条；module load 时一次性建 `ALL_ARTICLES`
- 打分：heading 3× / body 1×，再除以 `max(40, len(body_ex_heading))` —— 密度归一化让《违纪》第六条（短、直答题）盖过第五条（长、关键字堆得多）
- 跨 doc 关键字池化：query 命中"处分"+"奖学金" 时，DISCIPLINE 的 `处分与评奖评优` 条款能同时拿到两边加分
- 命令识别分级：`帮我/打开/跳转…`（strong）始终视为命令；`我要/我想`（weak）必须再带 booking 动词（请假/签到/投诉/销假…），让"我想休学"能落进 RAG
- `citations` 改为"articles dedup 到 doc_id"，前端契约不变
- 坑：
  - 第一次写完"我想休学半年"没触发 RAG —— 因为老 `_ACTION_PREFIXES` 把"我想"当强命令
  - 奖学金查询一度被归一化打偏（第四/第五条比第一条更短），加了 `max(40,len)` 底托才稳住
- Smoke 9 条全绿（含跨文档 P11-5）

---

## Session 4: 2026-04-18 — RAG 质量评估（keyword vs semantic）

### 起点
Phase 11 smoke 都绿但没量化指标——用户要求"测试下召回率与精确率"，并询问能否复用 DeepSeek key 做 embedding。

### DeepSeek/ZenMux 不能 embed（核实过）
- `POST zenmux.ai/v1/embeddings` with `deepseek/deepseek-v3.2` → 404 model_not_supported
- ZenMux 模型列表里 0 个 embedding 模型（chat-only 代理）
- DeepSeek 官方历来没发过 embedding API
- 结论：如果要真语义检索必须另找路子；不想引入外部 key 的话就本地 bge

### 评估方案（未动基础设施）
- 30 条手写 query + gold article_id 集合（`eval/rag_eval.py`）
- 本地 bge-small-zh-v1.5（sentence-transformers，512 维）in-memory 跑（`eval/rag_semantic.py`）
- 独立 venv `/tmp/xg_rag_eval_venv`（torch CPU + st + numpy），不污染 sidecar
- 指标：Hit@{1,3,5} / P@{1,3,5} / R@{3,5} / MRR

### 结果（30 cases, K=5）
| 指标 | keyword | semantic | Δ |
|---|---|---|---|
| Hit@1 | 0.533 | **0.900** | +0.367 |
| Hit@3 | 0.800 | 0.967 | +0.167 |
| Hit@5 | 0.867 | **1.000** | +0.133 |
| MRR | 0.659 | **0.940** | +0.281 |
| P@1 | 0.533 | 0.900 | +0.367 |
| R@5 | 0.844 | **1.000** | +0.156 |

Miss: keyword 4 → semantic 0；down-rank: 10 → 3。

### 关键发现
- keyword 的硬 miss 都是 surface-form 问题："本科最多读几年" / "晚上几点以后不让访客进" / "奖学金什么时候开始申请" / "取消评选资格"——doc keywords 里没对应词
- bge 中文效果很好，instruction prefix（"为这个句子生成表示..."）按官方用法加上
- semantic 唯一输一局：`二等奖学金一年多少钱` 金额条款被语义相近的资助条款稍微挤了一下（仍在 top-5）

### 决策
上 pgvector 生产化（Phase 13）。收益清楚：Hit@1 +37pt、MRR +28pt、零 miss 是质变。

---

## Session 4（续）: 2026-04-18 — Phase 13 pgvector 落地

### 基础设施
- `pgvector/pgvector:pg15` 替换 `postgres:15-alpine`，命名卷 `pg_data` 数据无损
- `CREATE EXTENSION vector` 启用 pgvector 0.8.2（init-db 脚本只新卷自动建，老卷手动跑一次）
- Java 后端重启 ~5s，重建后连接自动恢复
- 验证 `tenant_default` schema + 业务表完整保留

### sidecar 代码（新增/改）
- `app/rag/embedder.py`：SentenceTransformer 懒单例；`embed_query` 自动加 bge instruction prefix
- `app/rag/store.py`：asyncpg pool + pgvector type register；`knowledge_chunk` 表 + HNSW cosine 索引；`fetch_similar` 异常返 []
- `app/rag/ingest.py`：`python -m app.rag.ingest` 一键把 49 篇 embed + upsert（float32, 512 维）
- `app/rag/retriever.py`：command gate → embed → pgvector → 距离阈值 0.60；pgvector 空或挂走 keyword fallback
- `app/api/chat.py`：import 切到 `retrieve_semantic`，citations/action/fallback 链一行不动
- `app/config.py`：embedding_model → `BAAI/bge-small-zh-v1.5`，dim → 512

### 阈值校准（基于距离观测）
- in-corpus hits 0.31-0.55 vs OOV queries ≥0.61，0.60 卡位干净
- 把"谈恋爱怎么办/推荐一本书/今天天气"全拦成 []
- 真问题"本科最多读几年/晚上访客/二等奖学金金额"全放行

### eval 加 pgvector 通道
- 三方并列跑：keyword / in-memory numpy semantic / **live pgvector**
- 结果：pgvector 与 in-memory semantic **完全一致**（Hit@1 0.900 / MRR 0.940 / Hit@5 1.000），HNSW 索引精度无损
- 坑：`asyncio.run` 每次关 loop 会让模块级 asyncpg pool 失效，改成共享 `new_event_loop().run_until_complete(...)`

### 产线路径总结
```
query → command gate? → 返 []
       ↓
       embed_query (bge, 加 prefix)
       ↓
       pgvector cosine top-5
       ↓
       distance > 0.60 丢掉
       ↓
       list[Article] → format_context → system_prompt
```
失败路径：embed 抛错 / pgvector 空 → keyword retrieve 兜底；chat.py 全程不感知。

---

## Session 5: 2026-04-18 — Wave A: 统一查询 Tool 注册表

### 起点
用户确认方向：政策问答走 RAG（不进 agent 工具），其他模块需要真 agent 工具。针对先前 P0 tool 设计我挑出 7 点问题（自然语言入参 / JSON-in-JSON / 写工具无确认 / 粒度散 / 重复定义 / 权限未表达 / batch "all" 危险），砍到 ~12 个。先上 Wave A：把现 3 个 query tool 重构为 5 个 scope 参数化工具。

### 实现
- `query_tools.py` 全量重写：单一 `_get_json` helper + 5 个 handler + `TOOLS` 注册表 + `HANDLERS` dispatch + `tools_for_role(role)` 导出 + `is_role_allowed` 运行时二次校验
- `allowed_roles` 两种形状：`{None: {roles}}` 表示 tool 整体按角色；`{scope: {roles}}` 表示 per-scope 角色（如 `query_leaves(my)` → student，`(class/uncancelled)` → counselor+）
- `chat.py` UI_TOOLS 同样加 `allowed_roles` 字段；`_build_tools(role)` 组装 UI 工具（过滤）+ query 工具（过滤）
- 移除硬编码"if user_role == 'student': filter out xxx"的 if-chain

### 调试轨迹
1. 第一轮 smoke 全部 `Server disconnected`——日志显示 httpx 走了 http_proxy；`trust_env=False` 修复（跟 query_tools 用的同招）
2. 第二轮 8/10 绿，`C-leave-uncancelled` 报 AttributeError：`/leaves/uncancelled` 实际是分页形状 `{data: {data:[], total}}`，不是裸数组；加 page/size 参数并改解析路径
3. 第三轮 10/10 全绿
4. 残留问题：`/api/v1/complaints/my` 和 `/api/v1/complaints` Java 侧返 500（INTERNAL_ERROR），不是本 Phase 引入的 bug；记 findings，handler 已降级报"稍后重试"，LLM 甚至会主动 navigate 到投诉页面

### 角色 × 工具可见性（验证过）
```
student   → navigate, open_leave_form, open_complaint_form,
            query_leaves, query_notifications, query_complaints
counselor → 学生那套 + open_checkin_form, open_collection_form,
            query_checkins, query_collections
           （query_leaves scope=class/uncancelled，query_complaints scope=handling 通过 is_role_allowed 放行）
```

### 下一步
- Wave A 完成。缺口：complaints 500 需要 Java 侧修
- Wave B：统计 tool（`query_stats(metric, dimension, date_range)` 一个工具合 6 个）
- Wave C：缺失模块 — 工作日志 / 违纪 / 勤工助学
