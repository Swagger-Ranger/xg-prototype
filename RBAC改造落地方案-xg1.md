# RBAC 改造落地方案（xg1）

> 目标：在不大拆现有 RBAC、不破坏 workflow 主流程的前提下，把权限、组织范围、团队编组、虚拟角色和租户边界收口到几个清晰入口里。

| 项 | 内容 |
|---|---|
| 文档日期 | 2026-05-16 |
| 适用项目 | xg1 / 朝夕高校学生工作服务系统 |
| 输入文档 | `RBAC设计与金智对照.md`、`项目开发约定.md`、当前代码实现 |
| 结论 | 小步加 guard / validator / scope helper，不做 RBAC 大重构 |

## 1. 总结

当前 RBAC 让人感觉复杂，主要不是因为表设计过多，而是 3 类“范围”混在一起：

1. 功能权限：某人有没有权限进入页面、点击按钮、调用接口。
2. 数据范围：同一个接口里，此人只能看哪些学生、岗位、单位、学院数据。
3. 工作流实例受理人：某个具体流程节点分给谁处理。

这 3 件事不能压成一个万能 `role` 表，也不适合现在就上金智式 `sys_data_scope + ORM SQL 拼接`。xg1 当前阶段更适合保留现有模型，然后补齐几个薄弱边界。

推荐方向：

- 保留字符串权限码。
- 保留 `RolePermissionDefaults.java + DB override`。
- 保留 `sys_role.kind = role/team`，短期不拆 `sys_team`。
- 保留虚拟角色 `AssigneeStrategy`，不把虚拟角色塞进 `sys_role`。
- 不做任意 YAML table resolver，避免把工作流变成低配脚本引擎。
- 新增少量集中入口：`TenantSessionGuard`、`AssigneeCatalog`、`AccessScopeService`。

优先修 4 个具体风险：

| 优先级 | 问题 | 影响 | 建议 |
|---|---|---|---|
| P0 | `X-Tenant-Id` 与 token session tenant 未绑定 | 可能跨租户 schema 访问 | 请求阶段强制一致性校验 |
| P1 | workflow assignee 解析为空只 warn | 流程静默挂住 | 发布前校验 + 运行时 fail-fast |
| P1 | workflow validator 只认 `sys_role`，不认虚拟角色 | `employer_leader` 这类合法 DSL 会被新建/编辑拦掉 | 改成查 `AssigneeCatalog` |
| P2 | `listStaff` 对所有登录用户开放 | 租户内单位成员姓名横向可见 | 限制为本单位成员或管理员 |

## 2. 当前设计哪些不要动

### 2.1 不要把 `sys_role.kind` 现在拆成 `sys_team`

项目约定已经明确：

- `sys_role.kind = 'role'`：长期岗位定义，关注权限码。
- `sys_role.kind = 'team'`：业务编组，关注成员和时间窗。
- 用户管理下拉里，角色和团队都能挂到用户身上。

现有前端和后端已经按这个约定走：

- `RolePermissionAdminService` 管 `role/team`。
- `TeamsPage` 使用 `listRoles({ kind: 'team' })`。
- 用户管理页拉所有 `sys_role` 行，并给团队加“团队 · ”前缀。
- `sys_user_role` 是用户挂角色/团队的统一关系表。

如果现在拆成 `sys_team / sys_team_member`，会影响：

- 用户管理创建/编辑用户。
- 团队管理。
- 角色权限页。
- 工作流 `scope=global` 通过 `sys_user_role` 查人。
- 现有迁移 V116 和相关前端类型。

收益不大，风险很大。短期应该做的是明确 team 的边界，而不是拆表。

### 2.2 不要把权限默认迁回 DB seed

`RolePermissionDefaults.java` 的“代码默认 + DB override”适合当前 SaaS 模型：

- 新租户初始化简单。
- 默认权限随版本发布，不需要每个 tenant 跑一堆 seed。
- 默认权限不可在 UI 误删，减少把核心权限改坏的风险。
- DB override 只存“额外授予”的差异。

短期不要改成全 DB 配置。可以补测试和导出视图，让它更可审计。

### 2.3 不要把虚拟角色做成任意 SQL 配置

文档里提过这种 YAML：

```yaml
assignee:
  role: project_pi
  scope: same_project
  resolver:
    table: research_project
    user_id_field: principal_user_id
```

不建议 P1 做。原因：

- 它绕开 Java 类型检查，接近半个 SQL / ORM 配置引擎。
- 表名、字段名、业务主键关系一旦允许配置，就要做白名单、权限、审计、回滚。
- 工作流 DSL 当前明确“不暴露通用脚本引擎”，这个方向会把边界打开。

正确做法是继续用策略类，但把策略能力登记到一个目录里，解决“新人看 YAML 不知道怎么解析”的问题。

## 3. 目标架构

### 3.1 四层边界

```text
请求身份
  -> TenantSessionGuard: token tenant 与 schema tenant 一致
  -> Sa-Token: 是否登录、是否有功能权限
  -> AccessScopeService: 当前用户能看哪些业务对象
  -> Workflow AssigneeCatalog: 工作流 role/scope/bizType 是否可解析
```

### 3.2 概念分工

| 概念 | 表/代码 | 作用 | 不该承担 |
|---|---|---|---|
| 功能权限 | `sys_permission` + `RolePermissionDefaults` | 页面 / 按钮 / API 能否访问 | 不表达某个实例分给谁 |
| 长期角色 | `sys_role.kind='role'` | 学生、教师、学工处、用工单位等身份 | 不表达每个岗位 owner |
| 团队 | `sys_role.kind='team'` | 临时业务编组、评审委员会 | 默认不授予功能权限 |
| 组织范围 | `org_unit`、`org_closure`、`counselor_org_mapping` | 学院、班级、书院等数据范围 | 不表达外部用工单位 |
| 用工单位 | `employer` | 外部组织和成员 | 不建成每单位一个 `sys_role` |
| 虚拟角色 | `AssigneeStrategy` | workflow 节点按业务实体找人 | 不进入 `sys_role` |

### 3.3 减少复杂度清单

这部分不是新增大模型，而是把老师和研发都容易混淆的地方拆开。优先做“用户少理解一点、研发少改错一点”的减法。

| 复杂点 | 减法 | 用户体感 | 研发调整难度 |
|---|---|---|---|
| 角色 / 团队混在一个用户下拉里 | UI 分组展示：内置角色 / 自定义角色 / 团队；团队统一前缀“团队 · ” | 创建用户时知道“角色给权限，团队做编组” | 低 |
| 团队可能被当成隐藏权限组 | 后端禁止给 `kind='team'` 授权；权限解析只读取 `kind='role'` | 管理员不会误以为加团队就开通菜单 | 低-中 |
| 权限码数量增长后难以勾选 | 角色权限页默认展示模块摘要 / 权限包，高级模式再展开细项 | 少面对一屏 checkbox | 中，主要是前端 |
| 工作流里直接写 `role/scope` | 用 `AssigneeCatalog` 给前端和 AI 返回中文可选项，如“学生所在班级辅导员” | 配流程的人不用懂 `counselor|same_class` | 中 |
| 虚拟角色不透明 | 虚拟角色不进 `sys_role`，但必须登记 label、scope、bizType、解析策略 | 能解释“这个审批人从哪张业务表来” | 中 |
| assignee 为空只 warn | 发布前 dry-run，运行时先告警后 fail-fast | 减少“流程卡住没人知道” | 低-中 |
| 数据范围散在 controller | 先抽业务级 `AccessScopeService`，不急着上通用 data_scope 引擎 | 同角色看到的数据范围更一致 | 中 |
| 用工单位 staff 横向可见 | `listStaff` 只允许本单位 leader/operator 或管理员查看 | 用工单位不会看到别的单位成员 | 低 |
| 租户 header 与登录 session 两条线 | `TenantSessionGuard` 强制一致；缺 header 时用 session tenant | 用户无感，减少串租户问题 | 低 |
| 老角色别名太多 | UI 只展示核心角色；历史 code 后端兼容 | 管理端更干净 | 低 |
| 外部系统权限映射 | 金智等外部系统只同步身份 / 组织，不直接同步 xg1 权限 | 实施解释更简单 | 中 |

不建议为了“看起来简单”做的大动作：

- 不拆 `sys_team / sys_team_member`，否则用户管理、团队管理、workflow 全局派发都要改。
- 不把 `RolePermissionDefaults.java` 全搬回 DB seed，否则多租户初始化和版本升级更重。
- 不做任意 YAML 表名 / 字段名 resolver，否则 workflow DSL 会变成低配脚本引擎。
- 不现在上通用 `sys_data_scope`，先用 Java scope helper 收住高风险业务。
- 不把外部系统角色直接映射成 xg1 权限，本系统权限仍由 xg1 本地角色控制。

## 4. 阶段一：租户边界收口

### 4.1 问题

当前 `TenantFilter`：

- 从 `X-Tenant-Id` 读 tenant。
- 设置 `TenantContext.schemaName = tenant_ + tenantId`。
- 登录时 `AuthService` 把 tenantId 存入 Sa-Token session。
- 但后续请求没有校验 header tenant 是否等于 session tenant。

这意味着 token 和 header 是两条线。即使因为 per-tenant `sys_user` 多数情况下查不到对应用户，也不应该把这个作为安全边界。

另外，`TenantSchemaInterceptor` 遇到非法 schemaName 时只是 warn 后继续执行。这在连接池场景下不够硬，因为连接的 `search_path` 是连接级状态，不能依赖“继续执行”是安全的。

### 4.2 推荐实现

新增或改造：`xg-common/.../tenant/TenantFilter.java`

规则：

1. `/api/v1/auth/login`：允许从 body tenant 进入，保持现状。
2. `/api/v1/platform/**`：平台后台不进入租户 schema，由 `PlatformAuthFilter` 管。
3. 已登录请求：
   - session 里有 `tenantId`。
   - header 缺失：用 session tenant 填充 `TenantContext`。
   - header 存在但不等于 session tenant：直接 403。
4. 未登录请求：
   - 交给 Sa-Token 后续 401。
   - 不允许因为 header 存在就随便切 schema 后跑业务查询。
5. tenantId 必须先校验格式，再拼 schema。

建议 tenantId 格式：

```text
^[a-z0-9_]{1,32}$
```

不要允许大写、短横线、点号。

### 4.3 伪代码

```java
String headerTenant = request.getHeader("X-Tenant-Id");
String sessionTenant = tryReadSaTokenSessionTenant();

if (isPlatformPath(request)) {
    filterChain.doFilter(request, response);
    return;
}

String effectiveTenant;
if (sessionTenant != null) {
    if (headerTenant != null && !headerTenant.equals(sessionTenant)) {
        write403("租户与登录会话不一致");
        return;
    }
    effectiveTenant = sessionTenant;
} else {
    effectiveTenant = headerTenant;
}

if (effectiveTenant != null) {
    validateTenantId(effectiveTenant);
    TenantContext.setTenantId(effectiveTenant);
    TenantContext.setSchemaName("tenant_" + effectiveTenant);
}
```

### 4.4 同步修改 `TenantSchemaInterceptor`

当前非法 schemaName 时继续执行。建议改成：

- schemaName 非法：抛 `BizException` 或 `SQLException`，不要 `invocation.proceed()`。
- schemaName 为空且当前是需要租户的业务请求：尽早失败。
- 每次 query/update 前都显式 `SET search_path`，不要依赖连接池旧状态。

如果担心 public 查询受影响，可在 Filter 层把平台路径和明确 public 路径排除。

### 4.5 影响范围

| 文件 | 改动 |
|---|---|
| `TenantFilter.java` | 增加 session tenant 校验和 header fallback |
| `TenantSchemaInterceptor.java` | 非法 schema fail-fast |
| `AuthService.java` | 保持 session 写入 tenantId；补注释，删“header 仍有效”的过时说明 |
| 测试 | 新增 filter 单测 / MockMvc 测试 |

### 4.6 验收

- 登录 default 租户后，不传 `X-Tenant-Id` 可正常访问。
- 登录 default 租户后，传 `X-Tenant-Id: other` 返回 403。
- 非法 `X-Tenant-Id: default;drop` 返回 400/403，不进入 mapper。
- `/api/v1/platform/**` 不受 tenant filter 影响。

## 5. 阶段二：工作流 AssigneeCatalog

### 5.1 问题

当前有两个冲突：

1. 项目约定说虚拟角色 `employer_leader / position_owner` 不进 `sys_role`。
2. `WorkflowController.validateAssigneeRoles` 只检查 `sys_role.code`，不认虚拟角色。

这会导致新建/编辑包含虚拟角色的 workflow 定义时被误拦。老定义能跑，是因为它们可能是在 validator 之前 seed 或创建的。

另一个问题是 assignee 解析为空：

- `AssigneeResolver` 找不到策略时返回空。
- `ApprovalExecutor` 空 assignee 只 warn，然后 suspend。
- 最终 workflow 没有 pending task，流程静默卡住。

### 5.2 新增 AssigneeCatalog

新增包：

```text
xg-platform/src/main/java/com/xg/platform/workflow/assignee/
```

核心对象：

```java
public record AssigneeDescriptor(
        String role,
        String scope,
        Set<String> bizTypes,
        String label,
        boolean virtual,
        String ownerModule
) {}
```

接口：

```java
public interface AssigneeDescriptorProvider {
    List<AssigneeDescriptor> descriptors();
}
```

让现有策略可选实现这个接口：

- `BuiltinAssigneeStrategy`
- `GlobalRoleStrategy`
- `WorkStudyAssigneeStrategy`

`AssigneeCatalog` 负责聚合：

```java
@Component
public class AssigneeCatalog {
    public boolean supports(String role, String scope, String bizType) { ... }
    public List<AssigneeDescriptor> listAll() { ... }
}
```

### 5.3 Descriptor 建议

`BuiltinAssigneeStrategy`：

| role | scope | bizTypes | virtual |
|---|---|---|---|
| `counselor` | `same_class` | `*` | false |
| `class_master` | `same_class` | `*` | false |
| `class_monitor` | `same_class` | `*` | false |
| `dean` | `same_college` | `*` | false |
| `college_secretary` | `same_college` | `*` | false |
| `student_affairs_officer` | `global` | `*` | false |
| `student` | `self` | `*` | false |

`GlobalRoleStrategy`：

- 动态支持 `scope = global` 且 role 存在于 `sys_role.code`。
- `kind='role'` 和 `kind='team'` 都可以用于工作流全局派发。
- 但 team 默认不带功能权限，只作为人员集合。

`WorkStudyAssigneeStrategy`：

| role | scope | bizTypes | virtual | 解析 |
|---|---|---|---|---|
| `employer_leader` | `same_employer` | `workstudy_position` | true | `position.employer_id -> employer.leader_user_id` |
| `position_owner` | `same_position` | `workstudy_application` | true | `application.position_id -> position.owner_user_id` |

### 5.4 修改 workflow validator

替换 `WorkflowController.validateAssigneeRoles`：

当前逻辑：

```java
assignee.role 必须存在于 sys_role.code
```

改成：

```java
assignee.role + assignee.scope + workflowDefinition.bizType
必须被 AssigneeCatalog 支持
```

校验点：

- createDefinition
- updateDefinition
- publishDefinition
- AI author 返回 DSL 后也可以提示，但不必硬拦在 AI 端

注意：publish 必须再校验一次，因为历史 draft 可能是在旧规则下创建的。

### 5.5 运行时 fail-fast

`ApprovalExecutor` 遇到空 assignee，建议分两步。

第一步，灰度期：

- 保留 warn。
- 发布 `WorkflowAssigneeMissingEvent`。
- 通知系统管理员或写入审计。
- 提供扫描脚本找“运行中 + 当前 approval 节点 + 无 pending task”的异常实例。

第二步，确认存量定义无问题后：

```java
if (assigneeIds.isEmpty()) {
    throw new BizException(
        "WORKFLOW_ASSIGNEE_NOT_FOUND",
        "审批节点未解析到受理人：" + role + "/" + scope
    );
}
```

这样 workflow start 会失败并回滚当前事务，至少不会静默挂住。

### 5.6 WorkStudyAssigneeStrategy 加 bizType 校验

当前代码只有注释，没有硬校验。建议：

```java
if ("employer_leader".equals(role)) {
    requireBizType(instance, "workstudy_position", role, scope);
    ...
}

if ("position_owner".equals(role)) {
    requireBizType(instance, "workstudy_application", role, scope);
    ...
}
```

不匹配时不要返回空，应该抛明确错误。配置错就是配置错，不应该伪装成“无人可派”。

### 5.7 影响范围

| 文件 | 改动 |
|---|---|
| `AssigneeStrategy.java` | 可加 default descriptors，也可不改，新增 provider 接口 |
| `BuiltinAssigneeStrategy.java` | 提供 descriptors |
| `GlobalRoleStrategy.java` | 通过 catalog 动态支持 `scope=global` |
| `WorkStudyAssigneeStrategy.java` | 提供 descriptors + bizType 校验 |
| `WorkflowController.java` | validator 改查 catalog，publish 再校验 |
| `ApprovalExecutor.java` | 空 assignee 先事件告警，后续 fail-fast |
| 测试 | 加 AssigneeCatalog / WorkflowController / WorkStudyAssigneeStrategy 测试 |

### 5.8 验收

- `employer_leader|same_employer|workstudy_position` 可通过定义校验。
- `employer_leader|same_employer|leave` 被拒。
- `conselor|same_class` 拼错被拒。
- `team_xxx|global` 如果 team 存在，可通过校验并派给 team 成员。
- assignee 解析为空时，不再静默产生“无 task 的 running workflow”。

### 5.9 对现有 workflow 的影响评估

这次 RBAC 收口对 workflow 的影响要分清楚：**定义校验会影响新建 / 编辑 / 发布；运行时 fail-fast 会影响新发起的实例；已经在跑的实例靠 `definition_snapshot` 锁版本，不会因为重新发布定义而改流程图。**

#### 5.9.1 当前已使用的 assignee 组合

现有 migration 和代码里已经出现过这些组合，接入 `AssigneeCatalog` 前必须全部登记，否则 publish 校验会误伤存量流程。

| 业务 | definition | 已用 assignee | 当前解析来源 | 影响判断 |
|---|---|---|---|---|
| 请假 | `leave_v2 / leave_v3` | `counselor|same_class` | `BuiltinAssigneeStrategy` | 必须保留，低风险 |
| 请假 | `leave_v2` | `dean|same_college` | `BuiltinAssigneeStrategy` | 必须保留；如果学院未绑定 dean，会触发空 assignee 风险 |
| 请假 | `leave_v3` | `class_master|same_class` | `BuiltinAssigneeStrategy` | 必须保留；班级 `leader_id` 为空时会触发空 assignee |
| 请假 | `leave_v3` | `college_secretary|same_college` | `BuiltinAssigneeStrategy` | 必须保留；依赖院级角色绑定 |
| 请假 | `leave_v3` | `school_admin|global` | `GlobalRoleStrategy` | 必须保留；依赖 `sys_role.code` 和用户绑定 |
| 销假 | `leave_return_v1` | `counselor|same_class` | `BuiltinAssigneeStrategy` | 必须保留，低风险 |
| 勤工岗位 | `workstudy_position_v1` | `employer_leader|same_employer` | `WorkStudyAssigneeStrategy` | 虚拟角色；现有 validator 会误拦，Catalog 后应放行 |
| 勤工岗位 | `workstudy_position_v1` | `student_affairs_officer|global` | `BuiltinAssigneeStrategy` / global | 必须保留 |
| 勤工申请 | `workstudy_apply_v1` | `position_owner|same_position` | `WorkStudyAssigneeStrategy` | 虚拟角色；Catalog 前不能 hard fail |
| 勤工工时 | `workstudy_timesheet_v1` | `student|self` | `BuiltinAssigneeStrategy` | 必须保留 |
| 勤工薪资 | `workstudy_salary_v1` | `aid_center_officer|global` | `GlobalRoleStrategy` | 必须保留；依赖角色 seed 和用户绑定 |

#### 5.9.2 哪些改动不会破坏现有 workflow

| 改动 | 对现有 workflow 的影响 |
|---|---|
| 新增 `AssigneeCatalog` 只读目录 | 不改变运行时派人，只给 validator / UI / AI 提供同一份能力清单 |
| workflow 编辑器从 `role-codes` 切到 assignee catalog | 不影响已发布定义；只减少新定义填错概率 |
| team 不授予功能权限 | 不影响 workflow 把任务派给 team 成员，但要求 workflow global 查询不要复用“只查 role 权限”的 mapper |
| 权限解析过滤 `kind='team'` | 不影响 task assignee；只影响页面 / 按钮 / API 权限来源 |
| 外部系统只同步身份组织 | 不影响 workflow；workflow 继续使用本地 `sys_user_role` / 业务 FK 派人 |

#### 5.9.3 有风险的改动

| 改动 | 风险 | 保护措施 |
|---|---|---|
| publish 改成 AssigneeCatalog hard fail | 如果 Catalog 漏登记历史组合，老 draft 不能发布 | 先跑存量 workflow definition dry-run，确认所有 role/scope 都在 Catalog |
| `ApprovalExecutor` 空 assignee 直接抛错 | 新发起业务会回滚，不再创建“无任务 running 实例” | 先灰度：只发 `WorkflowAssigneeMissingEvent` + 管理员通知，一周后 hard fail |
| `WorkStudyAssigneeStrategy` 加 bizType 校验 | 如果历史实例的 `biz_type` 异常，会从“返回空”变成明确报错 | 先扫描运行中实例；确认 `workstudy_position / workstudy_application` 正确 |
| 权限 mapper 过滤 `kind='team'` | 如果历史上有人靠 team 获得功能权限，会失效 | 清理前导出 team 权限；真实需要的迁到自定义 role |
| `GlobalRoleStrategy` 误过滤 team | 将导致 `team_xxx|global` 无法派任务 | 工作流派人查询必须保留 role + team；只有权限查询过滤 team |

#### 5.9.4 推荐迁移顺序

1. **先做只读 Catalog，不接 hard fail**  
   注册全部现有组合：`counselor`、`dean`、`class_master`、`college_secretary`、`school_admin`、`student_affairs_officer`、`student`、`aid_center_officer`、`employer_leader`、`position_owner`。

2. **跑存量定义 dry-run**  
   扫描 `workflow_definition.config_json.nodes[*].assignee`，输出未知 `role/scope/bizType`，不修改数据。

3. **替换编辑器提示和 AI author 上下文**  
   `/workflows/role-codes` 保留兼容，但新接口应返回“可用于 workflow 的 assignee catalog”，包含中文 label 和适用 bizType。

4. **create / update hard fail，publish 先 warn**  
   新建和编辑挡住明显错误；发布历史 draft 先提示，避免突然卡住管理员。

5. **ApprovalExecutor 先告警，后 fail-fast**  
   第一阶段：空 assignee 仍 suspend，但发管理员通知 / 审计。  
   第二阶段：确认没有异常定义后，空 assignee 抛 `WORKFLOW_ASSIGNEE_NOT_FOUND`，让业务发起事务回滚。

6. **最后收 team 权限边界**  
   team 权限清理不应和 workflow fail-fast 同一天上线，避免定位问题时混在一起。

#### 5.9.5 验收脚本建议

上线前至少验证这些路径：

- 学生提交普通请假：能派给 `counselor|same_class`。
- 触发长假 / 多级请假：能派给 `college_secretary|same_college` 或 `school_admin|global`。
- 创建勤工岗位：能派给 `employer_leader|same_employer`，再派给 `student_affairs_officer|global`。
- 学生申请勤工岗位：能派给 `position_owner|same_position`。
- 工时确认：能派给 `student|self`。
- 薪资审批：能派给 `aid_center_officer|global`。
- 故意写错 `conselor|same_class`：create/update 被拒。
- 故意把 `employer_leader|same_employer` 用在 `leave`：publish 被拒或 warn。

## 6. 阶段三：team 权限边界收口

### 6.1 问题

`kind='team'` 的设计目标是“业务编组”，但当前从底层看，team 也是一行 `sys_role`，也能被 `sys_user_role` 挂到用户身上。

如果不收口，team 可以被误当成“隐藏权限组”：

- 给 team 加 `sys_role_permission`。
- 用户因为加入 team 获得功能权限。
- 管理员难以理解“团队”和“角色权限”的边界。

### 6.2 推荐规则

P1 规则：

> team 可以作为人员集合使用，可以用于 workflow `scope=global` 派发；team 不授予功能权限。

也就是说：

- 用户加入团队，不应该自动获得页面 / 按钮 / API 权限。
- 用户的功能权限只来自 `kind='role'` 的角色。
- 工作流派给团队成员，是另一件事。

### 6.3 后端修改

`RolePermissionAdminService.grantPerms`：

- 如果目标 `kind='team'`，直接拒绝。

```java
if ("team".equals(row.get("kind"))) {
    throw new BizException("BAD_REQUEST", "团队不授予功能权限，请到角色权限页配置角色");
}
```

`SysUserRoleMapper.findPermissionCodesByUserId`：

- JOIN `sys_role r` 后增加 `r.kind = 'role'`。

```sql
WHERE ur.user_id = #{userId}
  AND r.kind = 'role'
```

`StpInterfaceImpl`：

- DEFAULTS 只对 `kind='role'` 生效更干净。
- 如果短期不想改 mapper，可在查询 roleCodes 时拆成 permissionRoleCodes / allRoleCodes。

### 6.4 数据清理

迁移或运维 SQL：

```sql
DELETE FROM sys_role_permission rp
USING sys_role r
WHERE rp.role_id = r.id
  AND r.kind = 'team';
```

这个 SQL 只清理误配置，不影响 `sys_user_role` 成员关系。

### 6.5 前端修改

- 角色权限页只展示 `kind='role'`。
- 团队详情页不出现权限矩阵入口。
- 用户管理仍然列出 role + team，但文案区分：
  - 角色：授予权限。
  - 团队：用于业务编组 / 流程派发，不授予权限。

### 6.6 验收

- 给 team grant permission 返回明确错误。
- 用户只有 team 没有 role 时，不获得任何功能权限。
- workflow 可以把任务派给 team 成员。
- 用户管理仍可给用户挂团队。

## 7. 阶段四：AccessScopeService

### 7.1 问题

当前不少接口靠 controller 内分支做 scope，例如勤工助学 `listApplications`：

- student 只能看自己。
- employer-only 限制到自己单位的岗位。
- 学工处 / 校管理员可跨单位。

这种写法安全但容易散，后续每个 endpoint 都要记得补。

不建议现在上通用 `sys_data_scope` 表和 SQL 拼接器。xg1 当前业务对象还少，先做 Java 侧 scope helper 更稳。

### 7.2 新增 AccessScopeService

位置：

```text
xg-platform/src/main/java/com/xg/platform/security/AccessScopeService.java
```

或按业务放：

```text
xg-business/src/main/java/com/xg/business/workstudy/security/WorkStudyAccessScopeService.java
```

P1 建议先按业务做，因为勤工助学的 employer / position / application 关系很具体。

### 7.3 勤工助学 scope helper

```java
public class WorkStudyAccessScopeService {
    boolean isSchoolWorkStudyAdmin(Long userId);
    boolean isEmployerOnly(Long userId);
    List<Long> employerIdsOf(Long userId);
    List<Long> positionIdsOfEmployerUser(Long userId);
    boolean canViewEmployerStaff(Long userId, Long employerId);
    boolean canManagePosition(Long userId, Long positionId);
    boolean canDecideApplication(Long userId, Long applicationId);
}
```

先接 3 个高风险点：

1. `listApplications`
2. `listStaff`
3. `offboardByEmployer / batchOffboard`

### 7.4 `listStaff` 收口

当前：

```java
GET /api/v1/work-study/employers/{id}/staff
```

任何登录用户可见。

建议改为：

- `workstudy:employer:manage` 用户可看全部。
- 当前用户是该 employer 的 leader/operator，可看本单位。
- 其他用户返回 403。

### 7.5 验收

- employer A 不能看 employer B staff。
- employer A 不能用 B 的 positionId 查申请。
- 学工处 / 校管理员可看全部。
- 学生不能横向看任何单位 staff。

## 8. 阶段五：权限默认可审计

这一阶段不是为了改模型，而是为了让“代码默认权限”更可解释。

### 8.1 增加测试

新增测试：

```text
xg-platform/src/test/java/com/xg/platform/auth/RolePermissionDefaultsTest.java
```

覆盖：

- 核心 6 角色都存在。
- DEFAULTS 里的 permission code 必须存在于 seed 的 `sys_permission` 清单。
- `student` 不含管理类权限。
- `employer` 不含 `student:sensitive`、`system:*`。
- `super_admin` 只含 `*`。
- 老别名映射到预期核心权限集。

如果测试不想连 DB，可把权限码 seed 也抽成一个代码清单；或者做集成测试读 test migration 后的 DB。

### 8.2 增加导出接口

可选新增只读接口：

```text
GET /api/v1/system/roles/effective-matrix
```

返回：

- role code
- role name
- default permissions
- override permissions
- effective permissions

用途：

- 给管理员看。
- 给评审和测试导出。
- 后续变更可做 diff。

## 9. 阶段六：金智 / 外部系统接入边界

如果客户学校已有金智 UAP / 数据中心，最小可行接入路径：

### 9.1 只同步身份和组织，不直接同步权限

同步：

- 用户：写 `sys_user.external_id`。
- 组织：写 `org_unit` + `org_closure`。
- 学生归属：写 `student_profile.class_id` 或 `student_org_membership`。
- 辅导员 / 班主任关系：写 `counselor_org_mapping`、`org_unit.leader_id`。

不直接同步：

- 金智角色到 xg1 权限。
- 金智菜单资源到 xg1 `sys_permission`。

原因：

- 金智角色是学校本地系统语义，不一定等价于 xg1 的产品角色。
- xg1 权限码是产品能力边界，应由 xg1 控制。

### 9.2 需要映射时用 mapping 表

未来可加：

```sql
external_role_mapping (
  id,
  tenant_id,
  provider,              -- jz_uap / cas / wecom
  external_role_code,
  external_role_name,
  target_role_code,       -- xg1 sys_role.code
  enabled,
  created_at,
  updated_at
)
```

但 P1 不急。先让学校管理员在 xg1 里确认用户角色，或通过导入模板批量挂角色。

## 10. 推荐实施顺序

### Sprint 1：安全边界和 workflow 不挂死

| 任务 | 文件 | 验收 |
|---|---|---|
| tenant-session 绑定 | `TenantFilter.java` | header 和 session 不一致返回 403 |
| schema 非法 fail-fast | `TenantSchemaInterceptor.java` | 非法 schema 不执行 mapper |
| WorkStudy 虚拟角色 bizType 校验 | `WorkStudyAssigneeStrategy.java` | bizType 错误抛明确异常 |
| assignee 空告警 | `ApprovalExecutor.java` | 空 assignee 产生告警事件，不再只 warn |
| workflow 定义 dry-run 校验 | 新增 validator service | 能扫出未知 role/scope |

### Sprint 2：AssigneeCatalog 正式接入

| 任务 | 文件 | 验收 |
|---|---|---|
| 新增 `AssigneeCatalog` | `workflow/assignee/*` | listAll 可看到内置 + 虚拟 + global |
| validator 改查 catalog | `WorkflowController.java` | 虚拟角色合法，拼错角色拒绝 |
| publish 再校验 | `WorkflowController.publishDefinition` | 老 draft 配错不能发布 |
| 空 assignee fail-fast | `ApprovalExecutor.java` | 不产生无任务 running 实例 |

### Sprint 3：team 和单位 scope 收口

| 任务 | 文件 | 验收 |
|---|---|---|
| team 禁止授予权限 | `RolePermissionAdminService.java` | grant team 权限返回 400 |
| 权限解析过滤 team perms | `SysUserRoleMapper.java` / `StpInterfaceImpl.java` | team 不带功能权限 |
| 清理 team 权限脏数据 | Flyway migration | `kind='team'` 无 role_permission |
| `listStaff` scope 收口 | `EmployerController.java` / `EmployerService.java` | 外单位用户 403 |
| 抽 WorkStudyAccessScopeService | 新 service | controller 分支减少 |

### Sprint 4：可审计和外部接入准备

| 任务 | 文件 | 验收 |
|---|---|---|
| 默认权限测试 | `RolePermissionDefaultsTest.java` | 核心权限矩阵稳定 |
| effective matrix 导出 | `RolePermissionAdminController.java` | 可导出默认 + override |
| 金智同步设计补文档 | 对接文档 | 明确只同步身份/组织，权限本地映射 |

## 11. 回滚策略

| 改动 | 回滚方式 |
|---|---|
| tenant-session 绑定 | 加 feature flag `rbac.tenantSessionGuard.enabled`，异常时临时关闭 |
| schema fail-fast | 保留日志观测 1 天，再打开 hard fail |
| AssigneeCatalog validator | create/update 先 hard fail；publish 可先 warn，一周后 hard fail |
| ApprovalExecutor fail-fast | 先只发告警；确认无异常定义后打开 |
| team 不授予权限 | 清理前先导出 team 当前权限；如有真实使用，人工迁到自定义 role |
| listStaff scope | 前端若有跨单位下拉依赖，改为管理员权限或按当前单位切换 |

## 12. 需要补进项目约定的硬规则

建议追加到 `项目开发约定.md`：

```markdown
## RBAC / Workflow 补充约定

1. 租户上下文必须来自登录 session；`X-Tenant-Id` 只能与 session tenant 一致，不能单独决定 schema。
2. `kind='team'` 是业务编组，不授予功能权限；功能权限只来自 `kind='role'`。
3. workflow DSL 的 `assignee.role + scope` 必须通过 `AssigneeCatalog` 校验后才能发布。
4. 虚拟角色不进 `sys_role`，但必须在 `AssigneeCatalog` 登记 label、scope、bizType 和解析策略。
5. 审批节点解析不到受理人必须失败或告警，不允许静默产生无任务的 running workflow。
6. 外部系统角色不直接映射为 xg1 权限；先同步身份、组织和师生关系，权限由 xg1 本地角色控制。
```

## 13. 最终建议

这套 RBAC 不建议“大改成金智模式”。金智模式适合私有化、DB 配置驱动、实施人员长期驻场的场景；xg1 是 SaaS + 产品化规则 + AI 辅助运维，默认权限和 workflow 解析都应该更受控。

真正要改的是边界：

- 租户边界更硬。
- team 不再像隐藏权限组。
- workflow 受理人从“运行时碰运气”变成“发布前可验证”。
- 用工单位这类业务范围统一走 scope helper。

这样改，影响面小，能保护现有 workflow，又能让后续接实习、毕设、心理中心等模块时不继续堆复杂度。
