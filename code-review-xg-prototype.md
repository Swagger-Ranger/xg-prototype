# xg-prototype 分支 Code Review 报告

**Review 时间**：2026-05-15
**Review 范围**：xg-prototype 分支未提交改动 + 领先 main 的 commits
**重点模块**：workstudy / role+team / dataimport+Org / AI sidecar
**Review 方式**：4 个 code-reviewer agent 并行全维度审查
**整体结论**：**Request Changes** — 3 个 Blocker 都涉及安全 / 数据完整性，必须本批修

## 修复进度（P1 批次已完成）

| ID | 项目 | 状态 |
|----|------|------|
| B1 | 导出 employer 越权 | ✅ |
| B2 | countUsersBoundToRole 跨租户 | ✅ |
| B3 | TeacherImport 事务破坏（+ Student/Counselor 同步修） | ✅ |
| H4 | CreateRoleRequest.name `@NotBlank` | ✅ |
| H5 | listRoles kind 白名单 | ✅ |
| H6 | teamType 白名单 | ✅ |
| H7 | DataImportController 加 `@SaCheckPermission("system:user:manage")` | ✅ |
| H8 | BCrypt loop 内重算（B3 顺手修） | ✅ |
| H10 | AI sidecar 端点鉴权（新增 `app/api/deps.py` + AiSidecarClient 透传 token） | ✅ |
| H1 | batchNotify 走 NotificationOrchestrator（新增 `sendAdhoc`） | ✅ |
| M16 | 数据导入完成发通知（V118 模板 + Orchestrator） | ✅ |
| Bonus | DataImport failure-path 事务隔离：抽 `DataImportStatusUpdater` 用 REQUIRES_NEW 写 `status=failed` + 通知，外层 throw e 不再吞失败状态 | ✅ |
| H2 | batchOffboard/Notify 权限收口 `isEmployerInsider` | ✅ |
| H3 | EmployerService.listMine 下推 SQL（`@>` 双格式兼容） | ✅ |
| H9 | OrgAssignmentPanel 4 处 `describeApiError` | ✅ |
| H11 | sidecar response 异常字符串脱敏 | ✅ |
| H12 | writeRecommendationReasons 改走 authorRestTemplate(180s) | ✅ |
| M2 | YearSettingService.inWindow 用 Asia/Shanghai 替代 JVM 本地时区 | ✅ |
| M3 | workStudy.ts 3 处 raw fetch 加 `Authorization` + X-User-* header | ✅ |
| M4 | V119 cleanup orphan demo apps（不动 V110/V111 避免 checksum 破坏） | ✅ |
| M5 | export current view 加 engagement_status 过滤（B1 顺手修） | ✅ |
| M7 | UI 兜底 `?? '自定义角色'` 替代 `?? code` | ✅ |
| M12 | OrgAssignmentMapper findOrgType/countByNameAndParent 显式 tenant_id 防御 | ✅ |
| M9 | rolePermission.ts + workStudy.ts raw fetch 401 → `handleUnauthorized()` | ✅ |
| M11 | RoleMembersTable 服务端分页（50/页 + total）；AddMembersModal pool 限制注释 | ✅ |
| M13 | listOrgUnits 加 `admin_dept`；TS 类型 `OrgTreeNode.type` / `CounselorMapping.org_type` 扩展 | ✅ |
| M14 | DataImportStatusUpdater 加 `markExecuting`（REQUIRES_NEW），UI 长导入可见进度 | ✅ |
| M19 | workstudy.py 两个 JSON 端点（`write-recommendation-reasons` / `nl-to-report`）显式 `temperature=0.2` | ✅ |
| M22 | role_config.py prompt 每 module 限 20 条 + 截断 info 日志 | ✅ |
| 12 Medium / 15 Low | | ⬜ |

| 严重度 | 数量 |
|--------|------|
| 🔴 Blocker | 3 |
| 🟠 High | 12 |
| 🟡 Medium | 25 |
| ⚪ Low | 15 |
| **合计** | **55** |

---

## 🔴 Blocker（合并前必修）

### B1. workstudy 导出端点 employer 越权可下载全校 PII
- **文件**：`xg-backend/xg-business/.../workstudy/controller/WorkStudyController.java:242-252`、`workstudy/service/WorkStudyExportService.java:72-87`
- **现象**：`exportApplicationsCurrentView` / `exportByDsl` 检查 `BATCH_OPS_ROLES`（含 `employer`），但**不**做 employer 单位过滤；与刚做完的 `listApplicationsScopedToEmployers` 防越权口子不一致
- **影响**：employer 用户可导出全校学生 PII（姓名、家庭经济情况、自荐信文本）
- **修复**：在导出 wrapper 上复用 `listApplicationsScopedToEmployers` 的 position id 限制；或把 `employer` 从 `BATCH_OPS_ROLES` 移除、给导出加独立权限位
- **状态**：✅ 已修

### B2. role+team `countUsersBoundToRole` 跨租户裸查
- **文件**：`xg-backend/xg-platform/.../system/mapper/RolePermissionAdminMapper.java:194`
- **现象**：`SELECT COUNT(*) FROM sys_user_role WHERE role_id=#{roleId}` 没带 tenant_id；`@Select` 注解是否被 MyBatis-Plus 多租户插件拦截不可保证
- **影响**：租户 A 可能因租户 B 的绑定无法删角色；反向也可能漏判
- **修复**：显式 JOIN sys_user 加 `u.tenant_id=#{tenantId}`，或验证插件确实拦截并加注释
- **状态**：✅ 已修

### B3. TeacherImport `@Transactional` + 逐行 catch 把 PG 事务搞坏
- **文件**：`xg-backend/xg-business/.../dataimport/service/TeacherImportExecutor.java:40,132`
- **现象**：javadoc 声称"整批一事务"，但逐行 `catch (Exception e)` 吞 DB 异常 → PostgreSQL 标记事务 aborted，后续语句包括 `sessionMapper.updateById(session)` 全部失败
- **影响**：导入统计（成功/失败行数）失真；session 状态写不回
- **修复**：每行用 `PROPAGATION_NESTED` savepoint 包裹，rollback to savepoint 而不是丢到外层；或重写为「先全量校验、整批一事务、出错全回滚」
- **状态**：✅ 已修

---

## 🟠 High（强烈建议本批修）

### workstudy 模块

#### H1. `batchNotify` 直接调 NotificationService.send，绕开 NotificationOrchestrator
- **文件**：`WorkStudyService.java:625-666`
- **修复**：建 `ADHOC_BATCH_NOTIFY` 模板并走 Orchestrator；或给 Orchestrator 加 `skipDedup` 形参；不允许业务侧直接 `NotificationService.send`（违反"通知铁律"）
- **状态**：✅ 已修（给 Orchestrator 加 `sendAdhoc` 方法 —— 跳过 template 查找 + 跳过双轨去重，但仍由 Orchestrator 出口；WorkStudyService 不再注入 NotificationService）

#### H2. `batchOffboard` / `batchNotify` 权限只看 ownerUserId，与 `assertCanOperatePosition` 不一致
- **文件**：`WorkStudyService.java:605,646`
- **修复**：改用 `employerService.isUserOperatorOrLeader(pos.getEmployerId(), operatorId)`，让同单位 operator 能互相代办
- **状态**：✅ 已修（抽 `isEmployerInsider` helper 收口）

#### H3. `EmployerService.listMine` 全表 SELECT 再 Java 内存过滤
- **文件**：`EmployerService.java:113-121`
- **修复**：下推 SQL：`WHERE status='active' AND (leader_user_id=#{userId} OR operator_user_ids::jsonb @> to_jsonb(#{userId}::bigint))`
- **状态**：✅ 已修（兼容历史 number/string 两种 JSONB 形式）

### role + team 模块

#### H4. `CreateRoleRequest.name` 缺 `@NotBlank`
- **文件**：`CreateRoleRequest.java:29`
- **修复**：加 `@NotBlank`，跟 `UpdateRoleRequest` 一致
- **状态**：✅ 已修

#### H5. `listRoles` 的 `kind` 参数未做白名单
- **文件**：`RolePermissionAdminController.java:46`
- **修复**：service 入口校验 `kind ∈ {role, team, null}`，否则抛 BizException
- **状态**：✅ 已修

#### H6. `teamType` 未校验导致 PG CHECK 抛 500
- **文件**：`RolePermissionAdminService.java:262`
- **修复**：service 加 `VALID_TEAM_TYPES = Set.of("review","temporary","cross_dept","student_org","other")` 白名单
- **状态**：✅ 已修

### dataimport + Org 模块

#### H7. `DataImportController` 整个类无 `@SaCheckPermission` —— 任意登录用户可触发导入
- **文件**：`DataImportController.java:19`
- **修复**：类级加 `@SaCheckPermission("system:import:manage")`
- **状态**：✅ 已修

#### H8. `BCrypt.hashpw` 在 2000 行 loop 内每行算一次
- **文件**：`TeacherImportExecutor.java:126`
- **修复**：默认密码一致，loop 外算一次复用同一 hash
- **状态**：✅ 已修（B3 重构时一并处理；CounselorImportExecutor 没插 user 无此问题，StudentImportExecutor 不设默认密码也无此问题）

#### H9. `OrgAssignmentPanel` 4 处 `onError` 用 raw `e.message` 而非 `describeApiError`
- **文件**：`OrgAssignmentPanel.tsx:333,396,472,482`
- **修复**：统一改为 `describeApiError(e, fallback)`（导入已有）
- **状态**：✅ 已修

### AI sidecar 模块

#### H10. `/role-config/propose` 和 `/workstudy/*` 4 个端点完全无鉴权
- **文件**：`xg-ai/app/api/role_config.py:93-100`、`workstudy.py:55/135/215/302`
- **修复**：至少加 `internal_token` header 校验（参考 `app/tool/base.py`）；更彻底是 FastAPI Depends 透传到 Java 验 Sa-Token
- **状态**：✅ 已修

#### H11. 多处把 raw Exception 字符串放进 response body 给前端展示
- **文件**：`role_config.py:134`、`workstudy.py:85/173/243/246/342/348`
- **修复**：server-side log 完整异常，response 返回通用中文提示
- **状态**：✅ 已修（7 处 raw `f"...{e}"` 改通用中文，`logger.exception` 保留 server-side 栈）

#### H12. `AiSidecarClient.writeRecommendationReasons` 用 15s 超时但 LLM 要 20-30s
- **文件**：`xg-backend/xg-platform/.../insight/client/AiSidecarClient.java:176`
- **修复**：走 `authorRestTemplate`（180s）或单开 30-60s 模板
- **状态**：✅ 已修（改走 authorRestTemplate）

---

## 🟡 Medium（跟工单跟踪，要点）

### workstudy
- M1. `EmployerUpdateRequest.monthlySalaryCap` null=不改 → 永远清不掉。需 sentinel 或显式 `clearCap` 布尔（`EmployerService.java:68`）
- M2. ~~`YearSettingService.inWindow` 用 JVM 本地时区不读租户时区~~ ✅ 已修（`OffsetDateTime.now(Asia/Shanghai)`）
- M3. ~~前端 3 处 `fetch('/ai/...')` 绕开 axios，不带 token~~ ✅ 已修（抽 `aiSidecarHeaders()` helper）
- M4. ~~V110+V111 demo 数据混进生产 migration~~ ✅ 已修（V119 cleanup orphan apps；不动旧 migration 避免 Flyway checksum 失败）
- M5. ~~`exportApplicationsCurrentView` 不带 `engagementStatus`~~ ✅ 已修（B1 顺手补）
- M6. V112 模板 id 硬编码 8961-8964 可能跟自增序列撞

### role + team
- M7. ~~UI 用 `roleLabelMap[code] ?? code` 兜底会暴露英文 code~~ ✅ 已修（`?? '自定义角色'`）
- M8. 后端错误 message 拼了 `code` 而非 `name`，透到前端（`RolePermissionAdminService.java:254/258/391`）
- M9. `rolePermission.ts` raw fetch 不走 axios → 401 不跳登录（`:172-191`）
- M10. `TEAM_TYPE_LABEL` / `deriveStatus` 在 TeamsPage/TeamDetail 两份复制
- M11. `RoleMembersTable` 只拉前 100，`AddMembersModal` 只拉前 500 —— 大学量级会丢人

### dataimport + Org
- M12. ~~`OrgAssignmentMapper.findOrgType` / `countByNameAndParent` 依赖插件拦截 `@Select`~~ ✅ 已修（显式 `AND tenant_id=#{tenantId}`）
- M13. `listOrgUnits` `WHERE type IN ('college','class')` 漏 `admin_dept` —— TeacherImport 建出的 admin_dept 在树里看不见
- M14. `DataImportService.execute` 跟 B3 联动，session 状态可能跟实际数据分裂
- M15. `findAllRoleKeys` UNION ALL 可能塞 null（`DataImportWriteMapper.java:157-160`）
- M16. ~~**导入完成没发通知**（违反通知铁律）~~ ✅ 已修（V118 seed `DATA_IMPORT_COMPLETED` / `DATA_IMPORT_FAILED` 两模板；`DataImportService` 注入 Orchestrator，execute 成功 / 失败两条路径都发）
- M17. `ExcelExportService` 类内无 row 上限，靠外层保护

### AI sidecar
- M18. `_strip_md_fence` 用 `str.strip("`")` 按字符剥而非子串
- M19. `workstudy.py` LLM 调用用默认 `temperature=0.7`，JSON 输出端点应降到 0.2
- M20. `write-recommendation-reasons.positions` list 无 max_length
- M21. `nl-to-report` query 无输入侧防注入，靠输出 whitelist
- M22. `role_config.py` 把整张权限字典塞 prompt，无截断
- M23. `rate_limit_per_minute` 配了但未启用（dead config）

---

## ⚪ Low（15 项，挑要点列出）

- L1. `WorkStudyReportDsl.columns` 用 `LinkedList`，应改 `ArrayList`
- L2. `ScheduleInterviewRequest.interviewAt` 与前端 snake_case 命名一致性核对
- L3. `WorkStudyWorkflowListener` 旧 `NotificationService` import 清理
- L4. `RolePermissionAdminService` `java.sql.Date` import 易混淆
- L5. `MODULE_LABELS` 在 CreateRoleModal / RolePermissionPanel 重复
- L6. `CreateRoleModal` `void allRoles` 是无意义占位
- L7. `CreateRoleModal` 客户端生成 code 与服务端 team_<rand> 重复
- L8. `createOrg` 前端 snake_case / 后端 camelCase 命名核对
- L9. `TeacherImportExecutor.blankToNull` / `nullIfBlank` 同义方法
- L10. `OrgAssignmentPanel` Modal `destroyOnClose` 与 `resetFields` 重复
- L11. `workstudy.py` 模块级 `llm = DeepSeekProvider()` 与 `role_config.py` 按请求实例化不一致
- L12. `workstudy.py:231` 复制 `_strip_md_fence` —— DRY
- L13. `workstudy.py:242` `locals()` 判断变量存在是 code smell
- L14. `chat.py` system prompt 6000+ 字符单串，建议外置模板
- L15. Dashboard 区段标签 "AI 常用询问" 残留英文 "AI" 前缀（可接受）

---

## 修复优先级建议

| 批次 | 内容 | 范围 |
|------|------|------|
| **P1** | B1 / B2 / B3 + H4-H7 + H10 | 安全 + 数据完整性 |
| **P2** | H1 + M16 | 通知铁律违规两处 |
| **P3** | H2 / H3 / H8 / H9 / H11 / H12 | 其余 High |
| **P4** | M4（demo migration） + M7（暴露英文 code） | 数据洁净 + 品牌 |
| **P5** | 剩余 Medium + Low | 入工单跟踪 |

---

## 正向反馈（值得保留的做法）

- 通知 Orchestrator 改造（WorkStudyWorkflowListener）做得彻底
- `listApplicationsScopedToEmployers` server 端 employer 收口逻辑严密（仅导出端点漏补 → B1）
- 学生岗位资格过滤下推 PG 是大幅提升
- 数据导入校验先于执行的 pattern 稳健
- AI 降级 try-catch 一致应用
- V116 migration 设计良好（NOT NULL DEFAULT + CHECK + 跨字段约束）
- `describeApiError` 在大部分新代码里规范使用
- 鉴权 `@SaCheckPermission` 在 role-permission 全覆盖（仅 DataImportController 漏 → H7）
