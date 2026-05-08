# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. P0 技术栈

本项目为**高校学生工作服务系统**，AI 原生学生工作服务平台。P0 阶段技术栈如下：

### 后端

| 层次 | 技术选型 | 说明 |
|------|---------|------|
| 主服务 | **Java 17 + Spring Boot 3.x** | 单体架构，包含全部业务逻辑和工作流引擎 |
| AI Sidecar | **Python 3.11 + FastAPI** | Agent 引擎、大模型适配、意图识别，通过 REST API 与 Java 通信 |
| ORM | **MyBatis-Plus** | 含多租户插件（Schema 级隔离） |
| 认证 | **Spring Security + Sa-Token** | JWT Token，支持 CAS/OAuth2 对接 |
| 工作流 | **自建轻量状态机（Java）** | YAML/JSON DSL 配置驱动，5 种节点类型 |
| AI 框架 | **LangChain / LangGraph（Python）** | 路由 Agent + 场景 Agent，30-40 个任务级 Tool |
| 大模型 | **通义千问 / DeepSeek API（公有云）** | P0 阶段全部走公有云 API |

### 数据层（3 个组件）

| 组件 | 用途 |
|------|------|
| **PostgreSQL 15+** | 业务数据、工作流（JSONB）、向量检索（pgvector）、全文搜索（tsvector）、审计日志 |
| **Redis** | 会话缓存、Token 管理、分布式锁、API 限流 |
| **MinIO** | 文件/附件存储（S3 兼容） |

### 前端

| 端 | 技术选型 | 说明 |
|----|---------|------|
| Web 管理端 | **React 18 + Ant Design 5** | 辅导员/管理员主要工作界面 |
| 微信小程序 | **Taro 3（React 语法）** | 师生共用，按 RBAC 加载不同功能集 |
| 企业微信 | **应用消息 + 回调接入** | 推送触达 + 会话式入口，回链小程序 |
| 共享层 | **TypeScript types + API 请求层** | Web 与小程序共享 |

### 部署

| 项 | 方案 |
|----|------|
| 容器化 | **docker-compose** 单机部署（Java + Python + PG + Redis + MinIO） |
| 最低配置 | 1 台 8 核 16G，无 GPU（AI 走公有云 API） |

### 关键设计约束（编码时遵守）

- **租户隔离**：Schema 级，所有 SQL 通过 MyBatis-Plus 多租户插件自动路由，异步场景从表字段恢复 TenantContext
- **AI 可降级**：AI 增强逻辑用 try-catch 包裹，AI 不可用时所有业务通过传统界面完整运行
- **工作流 DSL**：表达式受限语法，computed 仅允许内置函数（`duration_days`、`date_diff`、`if_then`），不暴露通用脚本引擎
- **Tool 粒度**：用户任务级而非 CRUD 级，用户身份从上下文获取不暴露给 Agent
- **动态表单数据**：PostgreSQL JSONB + Generated Column 建索引
- **轻量优先**：能用 PG 解决的不加新组件，P0 不引入 RabbitMQ/ES/ClickHouse
- **通知接入**：新模块发通知 = (1) INSERT 一行 `notification_template` seed (2) 调 `NotificationOrchestrator.send(code, sourceType, sourceId, recipients, vars)`。通知中心 UI / AI 助手识别 / 角色偏好 / 双轨去重 / 三渠道扇出 全部自动适配，禁止业务侧绕开 Orchestrator 直接 `NotificationService.send`

### 项目文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 总体设计 | `总体设计-v2.md` | 架构、分阶段策略、商业模式 |
| P0 功能设计 | `P0-功能设计-v2.md` | 详细功能设计（5000+行），含数据模型、API、工作流、AI Tool |
| 需求评审报告 | `P0-需求评审报告.md` | 三方评审意见汇总 |

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
