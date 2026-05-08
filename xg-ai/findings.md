# Findings

## 2026-04-20 — GlobalExceptionHandler 把参数解析异常映射成 500 — 已修
- 症状：客户端调 `/complaints/my` 等 endpoint 时如果**漏传 X-User-Id** 一律返 `500 INTERNAL_ERROR`，看日志才知道是 `MissingRequestHeaderException`
- 根因：`xg-common/exception/GlobalExceptionHandler` 只处理了 `BizException` 和 `MethodArgumentNotValidException`，其他 Spring 参数解析异常（`MissingRequestHeaderException` / `MissingServletRequestParameterException` / `MethodArgumentTypeMismatchException`）落到 `Exception.class` → 500
- 修复：这三类全部走 400 BAD_REQUEST，error code 分别 `MISSING_HEADER` / `MISSING_PARAM` / `BAD_REQUEST`，message 含具体参数名便于定位
- 需重启 bootRun 生效（未接 devtools）
- 这也解释了 Wave A smoke 阶段记录的 "complaints 500"：当时某些 code path 的 header 注入遗漏 → 500（掩盖真因）

## 2026-04-18 — Wave A（统一查询 Tool）发现的问题

### Java 侧 complaints 模块 500 — 已修
- 根因：`tenant_default.complaint` 表不存在，V013 从未在该 schema 应用
- 现象：`tenant_default` 已有 27 张表（V001-V012、V014 等），唯独 V013（complaint）、V015（knowledge_qa）没到位
- 更深根因已修正（2026-04-21 复核）：`TenantMigrationRunner.java` 存在且启动时跑；tenant_default 已有 V030-V033 记录。早先"无自动运行机制"的断言不对。
- 仍属实：`application.yml` 没显式列 tenant path，runner 是 Java-side 编程式 Flyway
- 本次修复：手工 `docker exec xg-postgres psql` 执行 V013 DDL，插入 3 条 seed complaint
- 验证：smoke 套件 `S-complaint-my` 和 `C-complaints-h` 均返正确计数
- **长期债**：需要一个 tenant migration runner（Java 端），目前新增 tenant/V0xx.sql 不会自动生效

### `PageResult.total` — 2026-04-21 复核后修正
- 实测：`/leaves/my` 返 `total:"1"` 对应 `data_len:1`；`MyBatisPlusConfig` 里 `PaginationInnerInterceptor(POSTGRE_SQL)` 已装
- Jackson Long→String 是 JS 精度保护，不是 bug
- 早期 Wave A 看到的 "total=0 即使有数据" 大概率是特定 mapper 没 passed Page 对象、或 tenant schema 隔离导致 count SQL 跑错 schema；不是全局 interceptor 问题
- 结论：total 可信；如将来遇到个别端点 total=0 而 data 非空，查那个 mapper 而不是换 interceptor

### 响应形状统一性
- 大多数 list endpoint：`{code, data: {data:[], total, page, size}, message}`（MyBatis-Plus IPage 序列化）
- `/leaves/uncancelled` 也是这个形状，原先命名让我以为是裸数组，AttributeError 后才修
- 教训：所有列表接口一律走"分页 payload"路径

---

## Login Data Structure (from login/index.tsx)
localStorage.xg_user stores:
```json
{
  "id": "user_student_001",
  "name": "张同学",
  "role_codes": ["student"],
  "permissions": ["leave:submit", "collection:fill", "checkin:scan", ...],
  "tenant_id": "default"
}
```

## Role → Navigation Mapping (current state)
- student: 工作台, 请销假(我的), 通知任务, 接诉即办
- counselor: 工作台, 请销假(班级), 信息收集, 签到, 通知任务, 接诉即办, 学生信息
- dean: 工作台, 请销假(审批), 信息收集, 通知任务, 接诉即办, 学生信息
- school_admin: 全部 + 系统管理

## Permission Codes Used in Login
student: leave:submit, collection:fill, checkin:scan, complaint:submit, knowledge:ask, notification:receive
counselor: leave:approve, leave:manage, collection:manage, checkin:manage, notification:send, student:view, worklog:manage
dean: leave:approve, collection:manage, student:view, student:sensitive, workstudy:manage, discipline:manage
school_admin: system:manage, system:user:manage, system:org:manage, ...all others

## 前后端 API 路径对照 (已修正)
| 前端 | 后端 | 状态 |
|------|------|------|
| /leaves/* | /api/v1/leaves/* | ✅ 一致 |
| /checkins/* | /api/v1/checkins/* | ✅ 已修正 |
| /collections/* | /api/v1/collections/* | ✅ 已修正 |
| /notifications/* | /api/v1/notifications/* | ✅ 一致 |
| /complaints/* | /api/v1/complaints/* | ✅ 新建 |
| /students/* | /api/v1/students/* | ✅ 新建 |
| /system/users/* | /api/v1/system/users/* | ✅ 新建 |
| /knowledge/* | /api/v1/knowledge/* | ✅ 新建 (API 保留但页面合并到 AI) |
| /workflows/* | /api/v1/workflows/* | ✅ 已修正 assigneeId |

## 审查发现的关键问题（已修复）
- API Key 硬编码 → 环境变量
- SQL 注入 (TenantSchemaInterceptor) → 正则校验
- cancelLeave 状态错误 → cancel_pending
- 15 个 mutation 无 onError → 全部补齐
- 8 个危险操作无确认 → Modal.confirm
- checkin/collection API 路径不匹配 → 统一复数
- AI Panel 无 Authorization → 已添加

## 知识问答设计决策
- 不作为独立页面，整合到 AI 助手侧边栏
- AI 助手 = 功能操作入口 + 知识问答入口
- 快捷入口: 请假规定、考勤处理、奖学金政策、校规制度
- API 文件 (api/knowledge.ts) 保留，供 AI 后端调用

---

## Session 3 — AI Sidecar 真实化

### 环境阻塞点（决定走 MVP 路线）
- `xg-postgres` 容器只装了 `pg_trgm / plpgsql / uuid-ossp`，**没有 pgvector** — 不能做真正的向量检索
- `QWEN_API_KEY` 为空 — 没有 embedding 能力
- 结论：P0 RAG 直接"全文档塞 system prompt"，等用户要扩到 >5 份制度文或需要精排再上向量

### httpx 调用 localhost 的坑
- 现象：sidecar 调 `http://localhost:8080` → `httpcore.RemoteProtocolError: Server disconnected`
- 原因：`httpx.AsyncClient` 默认 `trust_env=True`，会读 `HTTP_PROXY / HTTPS_PROXY`，本机的 LLM 代理拦截了 localhost 流量
- 修复：所有调 Java 的 client 一律 `httpx.AsyncClient(..., trust_env=False)`
- 适用范围：`app/tool/query_tools.py`，以后任何新 sidecar→Java 调用都要照做

### Java API 返回体形状
遇到两次假设错误，记录下来避免重复踩：
- `GET /api/v1/notifications/unread-count` → `{"data": "0"}`（字符串不是对象），取值用 `int(resp.json().get("data") or 0)`
- 列表接口（`/leaves/my` / `/notifications/my` / `/leaves/class`）→ `{"data": {"data": [...], "total": N}}`，**双层 data**；total 可能是字符串
- 返回字段用下划线 snake_case：`leave_type_name / start_time / end_time / student_name / read_at / created_at`

### RAG 关键字路由的"动词前缀"过滤
- 问题：Q4 "帮我请明天一天事假" 触发了"请假"关键字 → 错误命中 LEAVE_POLICY → 返回 citations
- 修复：在 `rag/knowledge.py` 加 `_ACTION_PREFIXES = ("帮我","我要","我想","给我","替我","打开","去","跳转","创建","发起","提交")`；前缀命中直接跳过 RAG
- 原则：RAG 只服务"问制度"，不服务"办事"

### AnthropicProvider 结构化入口（Phase 10 已加）
- 保留 `chat_with_tools(list[ChatMessage])` 给简单调用方用（role+str）
- 新增 `chat_native(system, messages: list[dict], tools)` 直接吃 Anthropic 原生 messages 格式
- 返回 `AnthropicTurn(content, text, tool_uses[id,name,input], stop_reason, usage)`
  - `content` 是**已转 dict** 的 content blocks（text / tool_use），可直接当 `{"role":"assistant","content": turn.content}` 回塞
  - `tool_uses` 是便捷抽取，`id` 必须用于下一轮的 `{"type":"tool_result","tool_use_id": ...}`

### 单步 agent loop 的实际形态（chat.py）
```
第一次 llm.chat_with_tools(...) → tool_use(query_my_leaves)
  ↓ 本地 httpx 调 Java，拿到格式化好的中文 summary
把 summary 作为 user 消息追加：
  "[系统已执行 query_my_leaves，返回结果如下]\n...\n请基于上述结果用简洁自然的中文回答，不要再调用任何工具。"
第二次 llm.chat(...) → 纯文本回复
```
查询工具结果**不加 citations**（citations 仅用于 RAG）

### 当前 RAG 语料规模（Phase 11 后）
- 6 份制度文：
  - `leave_policy_v1` 《学生请假管理办法》
  - `scholarship_policy_v1` 《本科生奖学金评定办法》
  - `enrollment_policy_v1` 《本科生学籍管理办法》（休学/复学/退学/转专业/学位）
  - `discipline_policy_v1` 《学生违纪处分条例》（警告→开除、申诉、档案）
  - `financial_aid_policy_v1` 《家庭经济困难学生资助政策》（助学金/贷款/勤工）
  - `dormitory_policy_v1` 《学生宿舍管理规定》（门禁/熄灯/用电/访客）
- 共 49 条 article；`ALL_ARTICLES = tuple(a for d in ALL_DOCS for a in d.articles)`，module load 时一次性切好

### 条款级检索实现要点
- 切条靠 `^第[一二三四五六七八九十百零〇]+条[^\n]*$` 多行正则
- doc-level gate：doc 的 `keywords` 至少命中一个才进入
- 跨 doc 关键字池化：survivingDocs 的所有命中关键字合并成一个集合，再拿去给**每个**存活 article 算分 —— 关键是让跨主题条款（如《违纪》第六条"处分与评奖评优"）拿到两边的关键字
- 打分：`3 * heading.count(kw) + body_ex_heading.count(kw)`，再 `/max(40, len(body_ex_heading))`
  - `max(40, ...)` 底托避免极短条款因为"密度除以很小数"爆掉打分
  - 不加长度归一化时，长条款因堆关键字次数碾压短而准的条款（《违纪》第五条 vs 第六条 的反例）

### 命令识别分级（避免 "我想休学" 被当命令）
- `_STRONG_ACTION_PREFIXES`：`帮我/给我/替我/打开/去/跳转/创建/发起/提交` —— 始终算命令
- `_WEAK_INTENT_PREFIXES`：`我要/我想` —— 仅当句中还含 `_BOOKING_VERBS`（请假/销假/签到/投诉/反映问题/收集/打卡）时才算命令
- 之前 `_ACTION_PREFIXES` 把 `我想` 当硬命令，导致"我想休学怎么办"这种纯 info 问题被跳过 RAG

### citations 契约
- 前端 `Citation { doc_id, title }` 不变
- sidecar 改为：对 `retrieve()` 返回的 articles 按 `doc_id` 去重，每个 doc 只发一次 citation
- 只有"全程没触发 tool"的回复才附 citations —— 有工具执行时 `citations=null`，避免把制度引用挂到一次 query 上

---

## Session 4 — RAG 质量评估（keyword vs semantic）

### 评估集
- `eval/rag_eval.py`：30 条中文 query，gold 是手写 article_id 集合（不是 retriever 的输出）
- 覆盖 6 份制度文所有主要条款类型；包括 2 条多 gold（资助政策涉及 3 篇）

### 工具
- 本地 bge-small-zh-v1.5（sentence-transformers）；512 维；L2 归一化 → dot = cosine
- passage 端用 article.body（含 heading）；query 端按 bge 官方推荐加前缀 `为这个句子生成表示以用于检索相关文章：`
- 纯 in-memory numpy，49 篇一次性 embed；无 pgvector
- 评估 venv：`/tmp/xg_rag_eval_venv`（torch CPU + sentence-transformers + numpy）

### 结果（30 cases, K=5）
| 指标 | keyword | semantic | Δ |
|---|---|---|---|
| Hit@1 | 0.533 | 0.900 | +0.367 |
| Hit@3 | 0.800 | 0.967 | +0.167 |
| Hit@5 | 0.867 | 1.000 | +0.133 |
| MRR | 0.659 | 0.940 | +0.281 |
| P@1 | 0.533 | 0.900 | +0.367 |
| R@5 | 0.844 | 1.000 | +0.156 |

### Keyword 的硬伤（semantic 全修）
- "本科最多读几年" → keyword 零命中（doc keywords 里没有"几年"/"年限"/"最多"这种 surface form）；semantic 直达 enrollment#art7
- "晚上几点以后不让访客进" → keyword 零命中（关键词是"访客/门禁"，query 是口语化）；semantic 直达 dorm#art5
- "奖学金什么时候开始申请" / "哪些情况会被取消奖学金评选资格" → 命中 scholarship doc 但 article 没选对（流程/资格条款 heading 短、关键词少）

### Semantic 的 3 个轻微回退
- "二等奖学金一年多少钱"（金额）rank 5 —— 因为 financial_aid 里"奖学金金额"样式的条款语义很近
- "被警告处分了，当年还能评奖学金吗"rank 2 —— scholarship#art8（取消资格）排 1，discipline#art6（处分+奖学金）排 2，其实两条都该是 gold
- "想换宿舍怎么办"rank 2 —— dorm#art4（卫生）误排 1

### 决策
bge-small-zh-v1.5 +37pt Hit@1 / +28pt MRR，纯收益。下一步上 pgvector 生产化：
- `pgvector/pgvector:pg15` 镜像；命名卷 `deploy_pg_data` 保数据
- `knowledge_chunk` 表：`article_id PK, doc_id, doc_title, heading, body, embedding vector(512)`
- ingest 脚本从 `ALL_ARTICLES` 生成；retrieve 改走 `ORDER BY embedding <=> $1 LIMIT K`
- 保留 keyword retrieve 做 fallback（pgvector 未就绪时不崩）

---

## Session 4（续）— pgvector 生产化落地

### 镜像替换要点
- `pgvector/pgvector:pg15` 替换 `postgres:15-alpine`，**命名卷 pg_data 保数据**，业务无损
- init-db 的 `CREATE EXTENSION IF NOT EXISTS vector` 条件脚本只在首次初始化跑；现有卷需要 `docker exec xg-postgres psql -U postgres -d xg1 -c "CREATE EXTENSION IF NOT EXISTS vector"` 手动跑一次
- pgvector 0.8.2 自带 HNSW；建索引用 `USING hnsw (embedding vector_cosine_ops)`

### DATABASE_URL 坑
- `.env` 里没 DATABASE_URL 时 `settings.database_url` 落默认 `postgres:postgres`，但容器密码是 `postgres123`，会认证失败
- 加 `DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/xg1` 到 `xg-ai/.env`

### asyncpg + pgvector 使用姿势
- `register_vector(conn)` 必须在每个 conn 上调用；pool 的 `init=` 回调最顺手
- 传入/取出的向量自然是 `np.ndarray`，不用手动 `str(vec.tolist())` 包一层
- Query: `embedding <=> $1` 是 cosine **distance**（0=同向，2=反向），不是 similarity

### 距离阈值（bge-small-zh + 本 corpus）
- in-corpus 相关命中：0.31–0.55
- OOV（"谈恋爱/推荐一本书/今天天气"）：≥0.61
- 0.60 卡位干净；相关问题全放，OOV 全拦
- 留 `DEFAULT_MAX_DISTANCE` 常量注释说明，语料或模型换了必须重测

### eval 跑 pgvector 的 async 陷阱
- `asyncio.run` 每次新建 loop + 退出时关 loop，模块级 `_pool` 仍指向已死的 pool
- 下一轮调用会触发 "Event loop is closed" 异常 → `fetch_similar` 吞了返 [] → `retrieve_semantic` 走 keyword fallback → 测出来 pgvector 指标 = keyword，吓一跳
- 修法：eval wrapper 自己开一个 `loop = asyncio.new_event_loop()` 然后 `loop.run_until_complete(...)` 跨 30 条 query 共享

### 结果（pgvector 回归对比）
| 指标 | keyword | in-memory semantic | **pgvector** |
|---|---|---|---|
| Hit@1 | 0.533 | 0.900 | **0.900** |
| Hit@5 | 0.867 | 1.000 | **1.000** |
| MRR | 0.659 | 0.940 | **0.940** |
| R@5 | 0.844 | 1.000 | **1.000** |

pgvector = in-memory，说明 cosine ordering 一致（HNSW 索引在 49 条量级上精度没损失）。

### Fallback 链
`retrieve_semantic` 三层保护：
1. command-gate（`帮我/我想请假...`）→ 直接 []
2. `embed_query` 抛错 → keyword retrieve
3. pgvector 查出来空（表没 ingest 或 DB 抖）→ keyword retrieve
4. 拿到 chunks → 按 `distance <= 0.60` 过一道

sidecar 重启不依赖 embed，首次 query 才触发模型加载；chat.py 对 RAG 失败的 catch 也没碰，原错误处理链保留。
