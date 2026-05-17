# RBAC 设计与金智教育对照（评审稿）

> 目的：把 xg1（朝夕）当前 RBAC / 权限 / 多租户 / 工作流人员解析 的设计完整描述出来，
> 同时与金智教育（智慧校园 / 综合教务 / 学工平台）系列产品的**常见做法**做对照，
> 给 Codex 评审用。所有"我们这边"的论断都附代码定位，"金智那边"的论断只声称是
> **常见做法 / 行业惯例**——我没有金智内部源码权威资料，凡涉及金智的细节都已显式标注
> 「未验证」或「业内常见」，请评审时按"假设而非事实"对待。
>
> **写作前提**：xg1 当前阶段是 P0（单租户 demo 验证）/ P1（多租户 SaaS 准备），代码位于
> `/Users/yx/xg1`，主仓库 `Swagger-Ranger/xg-prototype` 分支 `xg-prototype`。
> 文档时间锚点：2026-05-15。

---

## 0. TL;DR

- xg1 是**多租户 SaaS** 架构，Schema 级隔离；金智系列产品**多为私有化单租户**部署，每校
  一套库。这是两者最大的部署语义差异。
- xg1 用**字符串权限码 + Sa-Token + 代码默认表**做权限解析；金智典型用**菜单 ID +
  资源 ID + Shiro / Spring Security + DB 配置表**。
- xg1 工作流自研轻量 YAML/JSON DSL，"人员解析"通过 `AssigneeStrategy` 策略链落到具体
  user_id；金智通常嵌入 Activiti / 阿里 Compileflow / 类似商用 BPM 引擎，"人员解析"
  靠流程变量 + 部门人员关系。
- xg1 引入 **role vs team 二元拆分**、**track（学术线/生活线）双轨**、**虚拟角色**
  （employer_leader / position_owner）等设计；金智典型只有"行政角色"+"岗位"扁平模型。
- 评审 5 个**我心里没底的设计选择**，详见 §7。

---

## 1. xg1 的 RBAC 设计

### 1.1 整体分层

```
HTTP 请求
  └─ TenantFilter            从 X-Tenant-Id header 设 TenantContext
      └─ Sa-Token 全局拦截器   checkLogin (白名单除外)
          └─ Controller 注解  @SaCheckPermission("xx:yy:zz")
              └─ StpInterfaceImpl.getPermissionList()
                  ├─ RolePermissionDefaults.defaultsOf(roleCode)   代码默认
                  └─ sys_role_permission rows                       DB override
```

`TenantContext` (ThreadLocal) + `TenantSchemaInterceptor` 在每条 MyBatis 查询前
`SET search_path TO tenant_<id>, public`，让 ORM 完全不感知租户字段。

**关键代码**：
- `xg-backend/xg-common/src/main/java/com/xg/common/tenant/TenantFilter.java`
- `xg-backend/xg-common/src/main/java/com/xg/common/tenant/TenantSchemaInterceptor.java`
- `xg-backend/xg-platform/src/main/java/com/xg/platform/auth/SaTokenConfig.java`
- `xg-backend/xg-platform/src/main/java/com/xg/platform/auth/StpInterfaceImpl.java`
- `xg-backend/xg-platform/src/main/java/com/xg/platform/auth/RolePermissionDefaults.java`

### 1.2 多租户：Schema 级隔离 + Header 驱动

每个租户在 PostgreSQL 里一个独立 schema：`tenant_<tenantId>`。所有业务表都在租户 schema
里建（migration 路径 `db/migration/tenant/`），平台层基础表也是。`public` schema 只放
完全共享的东西（实际目前几乎没用到，几乎所有表都是 per-tenant）。

**关键事实**：
- `sys_user` 在 `tenant/V001` 里，**per-tenant 而非全局**。同一物理用户跨租户视为不同账号
  （UNIQUE(tenant_id, username)）。
- 请求识别租户的入口只有 `X-Tenant-Id` HTTP header，没有走 subdomain / 路径前缀
  （TenantFilter.java 行 22）。
- 登录时 tenant_id 来自请求 body（`LoginRequest.tenantId`），不来自 header
  （AuthService.java 行 48-50）。**Tenant 与 user 解耦**，同一份 sys_user 表可能存在于
  多个租户 schema 内，但严格说是不同实体。

### 1.3 身份（sys_user）

```sql
sys_user (tenant/V001__create_sys_user.sql)
  id, tenant_id, username (UNIQUE per tenant),
  password_hash, real_name, gender, phone, email, avatar_url,
  external_id     -- CAS/OAuth2 外部 ID（SSO 对接预留）
  wechat_openid   -- 小程序对接
  wecom_userid    -- 企业微信对接
  status (active/disabled), privacy_agreed, last_login_at
```

支持三种外部账号关联点（external_id / wechat_openid / wecom_userid），不依赖 IDP
就能登录（password_hash 兜底）。**P0 初始密码统一 `xg@123456`**，P1 接 CAS/SSO 后
password_hash 失效。

### 1.4 RBAC 核心三表 + 用户-角色关联

```sql
sys_role               (id, tenant_id, code, name, kind, team_type, ...)
sys_permission         (id, tenant_id, code, name, module, type, parent_code, ...)
sys_role_permission    (role_id, permission_id)
sys_user_role          (user_id, role_id, org_id)
```

**`sys_role` 兼任两种语义**（V116 新增 `kind`）：
- `kind='role'`：传统 RBAC 角色（辅导员 / 学工处 / 班主任 / ...），可挂权限码
- `kind='team'`：临时编组（评审委员会 / 迎新志愿者），通常不挂权限码

`kind='team'` 还多带 3 列：`team_type`（review/temporary/cross_dept/student_org/other）、
`start_date`、`end_date`、`archived_at`。这是一个**有争议**的设计——`sys_role` 既承
"功能权限组"又承"任务编组"，详见 §7 开放问题。

**`sys_user_role.org_id`** 是 RBAC 的关键 scope 字段——同一个 user 可以"在 A 学院当
counselor，在 B 学院当 dean"，靠 (role_id, org_id) 区分。

### 1.5 权限码：dotted 字符串模型

权限是字符串 code，分为三类：

```
type=menu     菜单级（管页面是否能进，前端做导航过滤）
type=button   按钮级（管动作是否能做，后端 @SaCheckPermission 拦截）
type=data     数据级（暂存设计但 P0 没真正使用，由 service 内逻辑做范围控制）
```

命名规约 `module:resource:action`：

```
leave:submit          学生提交请假
leave:approve         教师审批
leave:return:manual   手工销假
workstudy:position:setup        发起岗位设定
workstudy:position:approve      岗位申请审批
workstudy:application:decide    岗位申请决策
system:user:manage    用户管理
```

权限码段位分配（V058 / V103）：
- 100 段 system、200 段 leave、300 段 collection、400 段 checkin、700 段 worklog、
  900 段 workstudy、1000 段 discipline、1100 段 ai、1200 段 alert、1300 段 talk、
  1400 段 academic。

### 1.6 角色 → 默认权限：代码默认表 + DB override

最反常的设计点：**默认权限映射写在代码里**而不是 DB seed。

```java
// xg-platform/.../auth/RolePermissionDefaults.java
public static final Map<String, Set<String>> DEFAULTS = Map.ofEntries(
    Map.entry("student",       STUDENT_PERMS),
    Map.entry("teacher",       TEACHER_PERMS),
    Map.entry("college_admin", COLLEGE_ADMIN_PERMS),
    Map.entry("school_admin",  SCHOOL_ADMIN_PERMS),
    Map.entry("super_admin",   Set.of("*")),
    Map.entry("employer",      EMPLOYER_PERMS),
    // 8 个老角色码作为 alias 复用对应核心权限集
    Map.entry("counselor", TEACHER_PERMS),
    ...
);
```

**StpInterfaceImpl 合并规则**：
```
最终权限集 = ⋃ {DEFAULTS[role.code]} ∪ {sys_role_permission rows}
if "*" ∈ 集合: → 用 sys_permission 全表替换
```

**理由**：
- 35+ 权限码 × 多角色 = 几百行 sys_role_permission；每新租户都要 seed
- 改成代码默认后，新租户只需 INSERT 5 个 sys_role 行 + 1 行 super_admin user_role
- sys_role_permission 表保留，只存"差异"（管理员后台手动加的 override）
- 升级版本调权限不用写 migration，改一份代码文件

**核心 6 vs 8 个老别名**（CORE_ROLE_CODES）：当前 DB 有 13 个角色 code 是历史包袱
（counselor / class_master / class_monitor 都是同一种"教师"身份的不同业务称谓）。
代码里这 8 个老 code 作为别名复用核心权限集，UI 只显示核心 6 个，老 code 服务存量数据。
P5 数据迁移后清理 DB。

### 1.7 super_admin 用通配符

```java
public static final String WILDCARD = "*";
// super_admin 的 DEFAULTS 是单元素 {"*"}
// StpInterfaceImpl 检测到通配符 → 拉 sys_permission 全表 code 替换
```

不是 Sa-Token 的模式匹配（那需要在配置里写规则），而是显式枚举所有 perm code。
新 perm 入库后 super_admin 自动获得，不用维护通配列表。

### 1.8 组织模型：org_unit + 闭包表 + 双轨

```sql
org_unit (V002)
  id, parent_id, name, code, type, leader_id, track
  type ∈ {school, college, major, class, academy, dorm_block}
  track ∈ {academic, residential}   -- V095 新增

org_closure (V002)
  ancestor_id, descendant_id, depth
```

**闭包表**用于"给定子节点，找所有祖先"——避开递归 CTE 在 PG 早版本的性能问题，O(1) 查表。

**双轨（track）**（V095）是一个独特设计：
- `track='academic'` — 学院/专业/班级（学术线）
- `track='residential'` — 书院/楼栋/楼层（生活线）

为什么需要双轨：一些大学（如华东师大、西交大、复旦）有书院制度，学生归属
"学院 + 书院"两条独立组织树。生活线辅导员（住书院的）和学术线辅导员（学院的）
对**同一学生**都要审批决策但语义不同。

代码用 `student_org_membership` N:N 表把学生绑到两条树上：
- 单轨学校：1 行（学生 → 学术 class）
- 双轨学校：2 行（学生 → 学术 class + 学生 → 书院 dorm_block）

`AssigneeLookupMapper.findCounselorsOfStudent` 的 SQL（双轨切换的单点）：

```sql
WITH r AS (
  -- 书院线辅导员（学生进了书院班才有）
  SELECT DISTINCT com.counselor_id
  FROM student_org_membership sm
  JOIN org_unit ou ON ou.track = 'residential' AND ou.type = 'dorm_block'
  JOIN counselor_org_mapping com ON com.org_id = sm.org_unit_id
  WHERE sm.student_user_id = ?
)
SELECT counselor_id FROM r
UNION ALL
-- 学院线 fallback：学生没进书院班才回退
SELECT ... FROM student_profile sp
JOIN org_closure oc ON oc.descendant_id = sp.class_id
JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id
WHERE NOT EXISTS (SELECT 1 FROM r) AND ...
```

### 1.9 多对多：counselor_org_mapping

```sql
counselor_org_mapping (V003)
  counselor_id, org_id, is_primary
  UNIQUE (counselor_id, org_id)
```

一个辅导员可以管多个班 / 多个院；一个班可以由多个辅导员共同管理。`is_primary`
标记主辅导员（统计 / 默认任务接收人时用）。这种"角色-组织-人 三体一表"是绕开
`sys_user_role` (role_id, org_id) 单一性的扩展。

### 1.10 工作流人员解析（虚拟角色 + 策略链）

工作流 DSL 节点声明：
```yaml
- type: approval
  assignee:
    role: counselor          # 业务语义角色码（不一定对应 sys_role.code）
    scope: same_class        # 解析范围
```

`AssigneeResolver` 按 `@Order` 升序遍历所有 `AssigneeStrategy` 找 `supports(role, scope)
== true` 的实现来解析具体 user_id 列表。

**当前三个策略**：

| Strategy | role+scope | 解析逻辑 |
|---|---|---|
| BuiltinAssigneeStrategy (Order=100) | counselor\|same_class、class_master\|same_class、class_monitor\|same_class、dean\|same_college、college_secretary\|same_college、student_affairs_officer\|global、student\|self | 走 AssigneeLookupMapper（基于学生组织归属） |
| GlobalRoleStrategy | <任意 sys_role.code>\|global | 全租户该角色码的所有 active user |
| WorkStudyAssigneeStrategy (Order=50) | employer_leader\|same_employer、position_owner\|same_position | 按 workflow.bizType + bizId 反查到 Position / Application，再读 entity 上的 leader_user_id / owner_user_id |

**虚拟角色**（virtual role）是 xg1 的特殊设计：`employer_leader` 和 `position_owner`
**不写进 `sys_role` 表**，纯靠业务实体上的 FK 字段动态解析。理由：
- 它们是"每个用人单位有一个 leader"、"每个岗位有一个 owner"——绑定到实体，不是绑定到全租户
- 写进 sys_role 后无法表达"哪个 leader 管哪个 employer"的多对多关系
- 用 entity FK 而不是 sys_user_role.org_id 的关键差异：org_id 限定 org_unit 表，而 employer
  和 work_study_position 不属于组织树

### 1.11 服务端授权 = 注解 + 路由级方法过滤

权限粒度分两层：

1. **注解层 (Sa-Token)**：`@SaCheckPermission("workstudy:position:setup")` 在 controller
   方法上拦截，403 短路。

2. **路由内角色分支**：对**同一接口**针对不同角色返回不同 scope 的数据。最近一次会话
   刚加的例子（WorkStudyController.listApplications）：
   ```java
   if (roles.contains("student")) {
       query.setStudentId(userId);
       return ...;
   }
   boolean isEmployerOnly = roles.contains("employer") && !... admin roles ...;
   if (isEmployerOnly) {
       return workStudyService.listApplicationsScopedToEmployers(query, userId);
   }
   ```
   employer 角色调同一个 endpoint 时，服务端强制把 positionId 限定到该 employer 拥有
   的岗位集合内——防止 employer A 传 employer B 的 positionId 拿候选 PII。

---

## 2. 金智教育的常见 RBAC 做法（业内观察 / 未亲见源码）

> **声明**：以下内容基于公开材料 + 业内实施同事的描述 + 金智官网产品说明
> （智慧校园解决方案、综合教务系统、学工系统、迎新系统等），**不是从金智源码总结**。
> 评审时请按"行业惯例假设"对待，凡涉及具体实现细节我都标了「未验证」。

### 2.1 部署：单租户私有化（**未验证**）

金智系列产品的主流交付是**私有化部署**——给每所大学单独一套库 + 单独一套应用实例。
集团客户（如同时管多个校区/学院的教育集团）会做"多组织 + 单库"或"多库 + 集成层"。

不是 SaaS。租户隔离不是产品的核心命题——隔离自然落到部署边界上。

### 2.2 身份：统一身份认证（UAP / CAS）+ 数据集成

身份**不是产品自带**，靠校方现有的 UAP（金智自家的统一认证产品）/ CAS 集成接入。
账号、组织、教职工档案统一来自数据中心，子系统（教务/学工/迎新）只引用 ID。

xg1 当前 `sys_user.external_id` / CAS 对接是为了**进入**这种环境预留的；金智典型场景
里 sys_user 这种表都不在子系统里建，而是引用 IDP / 数据中心的视图。

### 2.3 RBAC：角色 + 资源 + 数据范围（**业内常见**）

典型表结构（**业内常见，非金智专属**）：

```
sys_user           （外部）
sys_role           （角色，比如 院系秘书 / 教务员 / 任课教师）
sys_resource       （资源：菜单、按钮、API、报表）
sys_role_resource  （角色-资源 N:N）
sys_user_role      （用户-角色 N:N）
sys_data_scope     （数据权限规则，给"角色"或"用户"绑定一个范围条件）
```

权限不是字符串 code，而是**资源 ID**。新增菜单 = 在 sys_resource 里 INSERT 一行，
然后到管理后台勾选给哪些角色。**配置驱动而非代码驱动**。

数据权限（data scope）独立维度：例如"教务秘书"角色对学生表的查询范围限定到本院。
通常通过 SQL 拼接 `AND college_id = ?` 实现，或通过 ORM 层动态拦截。

### 2.4 组织模型：标准 4 层 + 师生关系多重

金智综合教务里的组织结构是大学行政标准：

```
学校 → 学院 → 专业 → 班级（行政班）
                ↘ 教学班（按选课产生，跨班）
                ↘ 自然班（教室分配）
```

学生 N:N 教学班；教师 N:N 教学班；行政班是"基础归属"。**多重身份是金智核心数据特征**。

我们没有教学班概念（P0 不涉及选课），所以 student 跟 class 是 N:1 + (residential) N:1。
教学班是 P3+ 才考虑的事。

### 2.5 角色：行政 + 业务岗位（**业内常见**）

金智典型角色清单（**业内常见**）：

```
学生            （视野=自己）
任课教师        （视野=所授课程的学生）
辅导员          （视野=所带班级的学生）
班主任          （视野=所带班级，通常==自然班主任）
院系秘书 / 教务员（视野=本院）
学院领导（院长 / 副院长 / 党总支书记）
教务处工作人员  （视野=全校）
学生处工作人员
后勤 / 公寓
财务 / 资助
其他业务部门（图书馆 / 心理 / 招生）
系统管理员
```

通常**没有 "employer 用工单位"** 这种"非教职工外部用户"角色——因为传统教学/学工
场景里没有外部用户。我们的 employer 是勤工助学 / 校企合作 / 实习导师等场景才有的
新型角色。

### 2.6 工作流：Activiti 嵌入式 BPM（**未验证，行业常见**）

商用产品流程引擎常嵌入 Activiti / Camunda / Flowable / 阿里 Compileflow。
配置流程靠图形化设计器（BPMN 2.0）画。

人员解析靠：
1. 流程变量（流程发起时塞进去：学生 ID / 所属学院 ID / 申请类型 ...）
2. 部门人员关系表（dept_user）
3. 流程定义里的 listener / expression（如 `${userService.findDeanOfStudent(studentId)}`）

xg1 自研轻量 DSL 是因为 BPMN 对一个 P0 demo 太重，且我们的几个核心流程都很简单
（请假 / 勤工岗位 / 申请 / 薪资）；同时自研 DSL 能强约束表达式语法（防 RCE）+ 自定义
节点类型（notification、publicity）。

---

## 3. 关键差异点对照

| 维度 | xg1（当前） | 金智典型（业内观察） | 风险 / 取舍 |
|---|---|---|---|
| 部署 | 多租户 SaaS | 单租户私有化 | xg1 的 schema 切换路径 hot path，性能影响待压测 |
| 租户识别 | X-Tenant-Id header | 部署边界 | header 易被前端写错；目标客户多了再考虑 subdomain |
| 身份源 | sys_user 本地 + external_id 预留 | 引用 UAP / CAS | xg1 自有账号体系，IDP 来后做 mapping |
| 权限模型 | 字符串 code (module:resource:action) | 资源 ID | 字符串可读 + 跨服务/前端共享方便，但易拼错；金智模型支持"按 ID 批量授权"更易 UI 化 |
| 权限默认 | 代码 Map 写死 + DB override | DB 配置驱动 | xg1 升级方便、租户初始化轻；金智 audit 友好（每条权限来自具体配置动作） |
| 权限粒度 | menu / button / data 三类 | menu / button / data / api / 报表 等多类 | xg1 缺 api / 报表类，是个待补缺 |
| super_admin | `"*"` 通配符运行时展开 | 显式绑定 | xg1 简单；新 perm 自动归 super_admin（双刃剑） |
| 组织模型 | org_unit + 闭包表 + track | org_unit + 教学班 + 自然班 | xg1 缺教学班（P0 不接选课） |
| 双轨 | academic + residential track | 多数没书院制设计 | xg1 显式建模书院制是亮点，但增加复杂度 |
| 角色 vs 团队 | `sys_role.kind` 二元 | 通常只有 "角色" | xg1 把团队挤进 sys_role 是争议设计（详见 §7） |
| 师生归属 | counselor_org_mapping (1 教师 → N 班) | 部门-人员 + 选课表 | xg1 主导用辅导员-班 N:N，金智更细化（选课每节课都是关系） |
| 工作流引擎 | 自研轻量 DSL (YAML/JSON) | Activiti / 商用 BPM | xg1 启动快、可控；金智功能丰富、有图形化设计器 |
| 工作流人员解析 | AssigneeStrategy 链（业务/全局/虚拟角色） | 流程变量 + dept_user + JS expression | xg1 类型安全、可单测；金智灵活但易出运行时错误 |
| 虚拟角色 | employer_leader / position_owner | （通常无此抽象） | xg1 把"按业务实体 FK 找人"显式做成 role，便于流程 YAML 统一表达 |
| 数据权限 | 服务端在 service 层硬编码 / 最近开始 autoscope | 通常 sys_data_scope 表 + ORM 拦截器 | xg1 类型安全但需逐 endpoint 实现，会漏；金智集中配置但运行时拼 SQL |

---

## 4. xg1 设计的独特点（值得保留还是修正？）

### 4.1 RolePermissionDefaults 写在代码里

**优点**：新租户初始化简单；权限调整改一份文件；可类型安全 union/diff。
**缺点**：业务侧管理员不能在 UI 里给某个角色加 / 删默认权限（只能加 override）；
跨版本回滚要看 git 而非看 DB。

**评审问题**：是否值得把 DEFAULTS 也迁回 DB？或者像 hibernate-envers 那样给 DEFAULTS
版本化？

### 4.2 `sys_role.kind` 兼任 role + team

**优点**：sys_user_role 这一张表统一表达"用户 - role 关联"和"用户 - team 编组"。
**缺点**：team 没业务权限码，但占用 role 命名空间；UI 必须按 kind 过滤；
"团队"的临时性、有期限性、可归档性是 role 没有的语义。

**评审问题**：要不要拆 sys_team / sys_team_member 两张独立表？拆掉后什么会变好/变坏？

### 4.3 employer 是 sys_role 里的角色

**问题**：employer 是**外部组织**（用工单位）的代表，跟 student / teacher 这种"个人
身份"不在一个语义层级。但当前 employer 作为 sys_role.code 跟其他角色平级出现。

**评审问题**：是不是应该把"用人单位组织"和"用户在该单位的角色"拆开？类似多租户里
"租户 + 用户在该租户的角色"那种二级模型。

### 4.4 虚拟角色 vs Workflow 变量

`employer_leader` / `position_owner` 是策略类硬编码（WorkStudyAssigneeStrategy.java）。
**新业务对象（如导师 advisor / 项目负责人 pi）**要加同类虚拟角色，必须改 Java + 部署。

**评审问题**：值得做成"配置驱动"吗？比如允许 workflow YAML 写：
```yaml
assignee:
  role: project_pi
  scope: same_project
  resolver:
    table: research_project
    biz_id_field: id_from_workflow
    user_id_field: principal_user_id
```

### 4.5 多租户 + per-tenant sys_user

**优点**：物理隔离强；同账号在不同租户可有不同权限/数据。
**缺点**：跨租户管理员（你自己运营平台时想跨租户 audit）必须建中央账号；OAuth 对接
要每租户独立配。

**评审问题**：是否值得做一层 "global identity" 表，让一个邮箱可以登录多个租户？
（类似 GitHub Org / Slack Workspace 关系）

---

## 5. 安全相关（最近会话变更，请重点看）

### 5.1 服务端 autoscope（employer 角色 listApplications）

最近一次会话刚加：`WorkStudyController.listApplications` 检测到 employer-only 角色时
强制把申请结果限定到调用者所属单位的岗位范围内。

```java
// xg-business/.../controller/WorkStudyController.java 行 144-163
if (roles.contains("student")) {
    query.setStudentId(userId);
    return R.ok(workStudyService.listApplications(query));
}
boolean isEmployerOnly = roles.contains("employer")
        && !roles.contains("school_admin")
        && !roles.contains("student_affairs_officer");
if (isEmployerOnly) {
    return R.ok(workStudyService.listApplicationsScopedToEmployers(query, userId));
}
```

**为什么需要**：employer 角色刚开放 AI 工具 `summarize_workstudy_applicants`，
工具底层调 `/applications?positionId=X`。employer A 让 AI"对比 employer B 的岗位 #X
候选"，原本会拿到 PII（姓名 / 困难等级 / 申请理由）。

**测试覆盖**：`WorkStudyApplicationListScopingTest.java` 5 个场景，含核心安全断言
"外单位 positionId → 不下推 applicationMapper"。

### 5.2 工作流任务受理人二次校验

`WorkflowEngine.handleApproval` 在最终下发批准/驳回前会校验当前 user 是不是
`taskInstance.assignee`，不靠 Sa-Token 权限。即使 user 有 `workstudy:position:approve`
权限，如果不是当前任务的指定受理人，仍然拒绝。

这是因为权限码是"能不能做这件事"，任务受理是"这件事的某个实例分给谁"——两层。

### 5.3 `listStaff` 端点的开放性（待评审）

`GET /api/v1/work-study/employers/{id}/staff`（本会话新增）**没加 `@SaCheckPermission`**
——任何登录用户都能调，列出某单位的 leader + operators 姓名。

**评审问题**：是否要至少 employer / counselor 角色 gate？跨租户由 TenantSchema 拦住，
租户内任何用户能看到任何单位的成员名，算敏感吗？

---

## 6. 评审重点请求

请 Codex 帮我做这几件事：

### 6.1 Threat model

1. xg1 用 `X-Tenant-Id` header 识别租户。如果攻击者偷了 token 改 header，能跨租户访问吗？
   （我的理解：Sa-Token 登录时把 user_id 绑到 token，user_id 在某个 schema 里查不到就
   登录态失效——但是否有 race condition / 缓存路径绕过？）

2. RolePermissionDefaults 是代码 Map，单元测试只覆盖了 "defaultsOf(code) 返回非空"。
   是否需要补**核心 6 个角色 vs 所有 permission code 的笛卡尔交叉表测试**，确保 P3
   管理员手动 override 时不会无意触发某些"默认就该有"的权限？

3. WorkStudyAssigneeStrategy 用 `instance.getBizType() + instance.getBizId()` 反查
   实体。如果有人**篡改 workflow 实例的 bizId**，能不能把工作流"挂到"别的 position
   上、让任务派给错的人？

### 6.2 配置 vs 代码默认的合理边界

DEFAULTS 写在代码里这个设计能撑到多大规模？同事评审会有什么意见？预期 1 年内会
长到多大（按当前 35+ → 1 年内可能 ~80）？

### 6.3 多租户 sys_user 的复用门槛

跨租户 admin（运营 SaaS 平台的内部人员）当前没设计入口。如何**正确地**做这个？是
建立 "global_admin" 单独表，还是 super_admin 跨租户登录？

### 6.4 工作流虚拟角色的扩展性

`WorkStudyAssigneeStrategy` 把 employer_leader / position_owner 写死。后续接入实习
（intern_supervisor）、毕设（thesis_advisor）、心理（psy_counselor）等场景，每个都
要加一个策略类。是否值得做成 metadata 驱动？

### 6.5 与金智集成的现实路径

如果某客户校用了金智的 UAP + 数据中心，xg1 怎么接？最小可行方案是什么？
- 走 CAS 拿到 external_id 后落到 sys_user.external_id
- 组织树通过数据中心 ESB 同步到 org_unit
- 师生关系定时拉教务数据中心，更新 counselor_org_mapping
- 但金智数据中心的"角色 / 岗位"是否还映射到我们 sys_role？还是只同步用户和组织，
  角色用我们自己的？

---

## 7. 我心里没底的几个开放问题

> 评审时如果你不知道哪个该问，先问这几个。

### Q1: sys_role.kind 二元设计是不是过度？
- 看起来"team"语义跟"role"差别很大（有时限、有 archived_at、不挂权限），强行塞同一表
- 但拆开有运维成本（管理员管两张表）。哪个更优？

### Q2: 字符串权限码 vs 资源 ID 模型对长期演进影响？
- 字符串可读，跨服务/前端共享方便
- 但 1 年后到 80+ 权限码时，"管理员勾选权限组合"UI 会不会变成密恐？
- 还是字符串本身没问题，是 UI 该按 module 分组展示？

### Q3: 代码 DEFAULTS 表的演进路径？
- 同事开始觉得"为啥不写 DB seed 然后 admin UI 编辑就行"。这个想法本质对吗？
- 还是说我们的"代码默认 + DB override"才是正确的分层？

### Q4: 虚拟角色（employer_leader / position_owner）是不是一种 leak abstraction？
- 它把"工作流 DSL 看到的 role"和"sys_role 看到的 role"语义割裂了
- DSL 写的 role: employer_leader 既不在 sys_role 里也不在用户的 role_codes 里
- 一个新人来读 YAML 完全不知道 employer_leader 是怎么解析的

### Q5: 多租户 Schema 切换的性能边界？
- 每个 MyBatis 查询前 `SET search_path TO ...`，看起来便宜，但实测呢？
- 高 QPS 场景（如批量工作流 tick）会不会变 hot path？

---

## 8. 附录

### 8.1 当前完整角色清单（共 14 个）

```
核心 6:
  student            学生
  teacher            教师（通用）
  college_admin      学院管理（院系秘书 / 教务员）
  school_admin       校级管理
  super_admin        超级管理员
  employer           用工单位

老角色别名（P5 数据迁移后清理）:
  counselor                辅导员       → TEACHER_PERMS
  class_master             班主任       → TEACHER_PERMS
  class_monitor            班长         → STUDENT_PERMS
  dean                     院系领导     → COLLEGE_ADMIN_PERMS
  college_secretary        学院党总支秘书 → COLLEGE_ADMIN_PERMS
  student_affairs_officer  学工处       → SCHOOL_ADMIN_PERMS
  student_affairs_director 学工处长     → SCHOOL_ADMIN_PERMS
  aid_center_officer       资助中心    → SCHOOL_ADMIN_PERMS
```

### 8.2 当前完整权限码清单

详见 `xg-platform/.../auth/RolePermissionDefaults.java` 以及 `db/migration/tenant/V058 / V103`。
按 module 分布：

```
system  100 段  6 项   menu(user/org/role/audit/ai-metrics/field) + 1 项 super(*)
leave   200 段  7 项   submit/approve/proxy/stats/manage/return:manual/config
collection 300 段  3 项  fill/manage/export
checkin 400 段  3 项   scan/manage/export
worklog 700 段  3 项   write/manage/export
workstudy 900 段  ~12 项 position(view/apply/approve/setup/setup_approve/manage)
                       + salary(view/process/submit)
                       + application:decide + timesheet(report/finalize)
                       + employer:manage + yearsetting:manage
discipline 1000 段  5 项  manage/create/approve/appeal/export
ai      1100 段  2 项   assistant:use + observer:manage
alert   1200 段  4 项   view/handle/scan/rule:manage
talk    1300 段  2 项   record/manage
academic 1400 段  1 项  manage
```

### 8.3 工作流虚拟角色清单

```
employer_leader | same_employer    用人单位负责人（按 employer.leader_user_id）
position_owner  | same_position    岗位负责人（按 work_study_position.owner_user_id）
```

### 8.4 关键文件索引

| 主题 | 文件 |
|---|---|
| 多租户 Filter | `xg-common/.../tenant/TenantFilter.java` |
| 多租户 MyBatis 拦截器 | `xg-common/.../tenant/TenantSchemaInterceptor.java` |
| Sa-Token 全局拦截 | `xg-platform/.../auth/SaTokenConfig.java` |
| 权限解析 | `xg-platform/.../auth/StpInterfaceImpl.java` |
| 角色默认权限 | `xg-platform/.../auth/RolePermissionDefaults.java` |
| 用户-角色 Mapper | `xg-platform/.../system/mapper/SysUserRoleMapper.java` |
| 工作流人员解析（通用） | `xg-platform/.../workflow/engine/BuiltinAssigneeStrategy.java` |
| 工作流人员解析（全局） | `xg-platform/.../workflow/engine/GlobalRoleStrategy.java` |
| 工作流人员解析（勤工助学虚拟角色） | `xg-business/.../workstudy/workflow/WorkStudyAssigneeStrategy.java` |
| RBAC 表 schema | `xg-app/.../db/migration/tenant/V003__create_rbac_tables.sql` |
| sys_role kind 拆分 | `xg-app/.../db/migration/tenant/V116__sys_role_team_columns.sql` |
| 组织表 + 闭包 | `xg-app/.../db/migration/tenant/V002__create_org_tables.sql` |
| 双轨 track 引入 | `xg-app/.../db/migration/tenant/V095__residential_track_foundation.sql` |
| employer 角色 + workstudy 权限 | `xg-app/.../db/migration/tenant/V058__rbac_employer_role_and_workstudy_perms.sql` |
| 25 个按钮权限 | `xg-app/.../db/migration/tenant/V103__seed_button_permissions.sql` |

---

## 9. 给评审人的一句话

xg1 走的是 **SaaS + 自研轻量 + Java 类型安全**路线，金智走的是**私有化 + 商用 BPM
+ DB 配置驱动**路线。两者在校园 IT 场景**都正确**，差异主要来自部署与运维假设。

我自己觉得**最值得审的三点**：
1. §5.3 `listStaff` 端点的开放性是不是越权扩散？
2. §4.4 虚拟角色机制是不是一种 leak abstraction？
3. §6.1.3 工作流 bizId 篡改的攻击面有没有？

请重点 push back 这些。
