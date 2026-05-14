"""Workflow 配置自然语言改 endpoint —— A.1 P0 核心 AI 入口。

老师在右下角 AI 助手里说"事假改成 5 天",AIPanel 走两步:

  1) sidecar /chat LLM 检测意图 → emit UI tool
     `propose_workflow_config_change(biz_type, college_id?, instruction)`
  2) AIPanel 收到 action → POST 本 endpoint /workflow-config/propose
     - 本 endpoint 调 backend GET /yaml 拿当前已发布的 YAML 文本
     - LLM 输出**结构化 op**(不直接重写整 YAML)
     - Python 把 op apply 到 YAML AST 上,精确修改,未提到的节点 100% 保留
     - 校验 + 零改动检测
     - 返回 {new_yaml, diff_zh, change_summary, ai_message}
  3) AIPanel 渲染中文 diff 卡 + [确认应用]按钮
  4) 老师确认 → AIPanel 调 backend POST /api/v1/workflow-config/apply

为何用结构化 op 而不是让 LLM 重写 YAML:6KB YAML LLM 99% 是搬运,易掉/写错;
用 op LLM 只输出 5-50 行,Python deterministic apply,稳定性 50%→90%+。
复杂改动(新增假别/改 form)走 complex_rewrite 兜底,LLM 仍然重写 YAML。
"""
from __future__ import annotations

import copy
import json
import logging
from typing import Any

import httpx
import yaml
from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.config import settings
from app.llm.deepseek import DeepSeekProvider

router = APIRouter(prefix="/workflow-config", tags=["workflow-config"])
logger = logging.getLogger(__name__)


# ---------- 角色映射 ----------

ROLE_ZH = {
    "counselor": "辅导员",
    "class_master": "班主任",
    "class_monitor": "班长",
    "college_admin": "院系管理员",
    "college_secretary": "院系书记",
    "dean": "院系领导",
    "student_affairs_officer": "学工处人员",
    "student_affairs_director": "学工部部长",
    "school_admin": "校级管理员",
}

ROLE_SCOPE = {
    "counselor": "same_class",
    "class_master": "same_class",
    "class_monitor": "same_class",
    "college_admin": "same_college",
    "college_secretary": "same_college",
    "dean": "same_college",
    "student_affairs_officer": "global",
    "student_affairs_director": "global",
    "school_admin": "global",
}

VALID_ROLES = set(ROLE_ZH.keys())


# ---------- op apply: set_chain ----------

def _build_chain_for_leave_type(leave_type: str, tiers: list[dict]) -> list[dict]:
    """根据老师指定的 tier 列表(累积 roles)重建某假别的整条审批链节点。

    tiers 每项形如 {threshold: int|None, roles: ["class_master","counselor"]},roles 是
    **累积**列表(包含前面 tier 的角色)。算法对每个 tier:
      - 计算「相比前一 tier 新增的角色」(role_added),为每个新角色添 1 个 approval 节点
      - 把上一节点(approval 或 condition)的 next 指针接到本节点
      - 若不是最后一档,加 condition 节点判 `duration_days <= threshold`,
        命中走 approved,默认走下一档第一个新 approval
      - 最后一档结束后,最后一个 approval 的 next 指 approved
    """
    nodes: list[dict] = []
    accumulated: list[str] = []
    last_id: str | None = None

    def wire(from_id: str, to_id: str) -> None:
        for n in nodes:
            if n["id"] != from_id:
                continue
            if n["type"] == "approval":
                n["next"] = to_id
            elif n["type"] == "condition":
                for b in n["branches"]:
                    if b.get("when") == "default" and not b.get("next"):
                        b["next"] = to_id
                        return
            return

    for i, tier in enumerate(tiers):
        is_last = i == len(tiers) - 1
        threshold = tier.get("threshold")
        tier_roles = tier.get("roles") or []
        new_roles = [r for r in tier_roles if r not in accumulated]

        for role in new_roles:
            base = f"{leave_type}_{role}"
            node_id = base
            counter = 1
            while any(n["id"] == node_id for n in nodes):
                counter += 1
                node_id = f"{base}_{counter}"
            nodes.append({
                "id": node_id,
                "type": "approval",
                "name": ROLE_ZH.get(role, role) + "审批",
                "assignee": {"role": role, "scope": ROLE_SCOPE.get(role, "global")},
                "timeout": {"duration": "48h"},
                "next": None,
                "rejected_next": "rejected",
            })
            if last_id is not None:
                wire(last_id, node_id)
            last_id = node_id
            accumulated.append(role)

        if not is_last and threshold is not None:
            check_id = f"{leave_type}_check_{i}"
            counter = 1
            while any(n["id"] == check_id for n in nodes):
                counter += 1
                check_id = f"{leave_type}_check_{i}_{counter}"
            nodes.append({
                "id": check_id,
                "type": "condition",
                "name": f"{ROLE_ZH.get(leave_type, leave_type)}天数判断_{i}",
                "branches": [
                    {"when": f"duration_days <= {threshold}", "next": "approved"},
                    {"when": "default", "next": None},
                ],
            })
            if last_id is not None:
                wire(last_id, check_id)
            last_id = check_id

    if last_id is not None:
        last_node = next(n for n in nodes if n["id"] == last_id)
        if last_node["type"] == "approval":
            last_node["next"] = "approved"
        elif last_node["type"] == "condition":
            for b in last_node["branches"]:
                if b.get("when") == "default" and not b.get("next"):
                    b["next"] = "approved"

    return nodes


def _apply_set_chain(cfg: dict, leave_type: str, tiers: list[dict]) -> None:
    """在 cfg(已 yaml.safe_load 的 dict)上原地应用 set_chain 改动。"""
    nodes = cfg.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("YAML 缺少 nodes")

    router = next((n for n in nodes if n.get("id") == "type_router"), None)
    if not router:
        raise ValueError("type_router 节点不存在")
    branches = router.get("branches") or []
    branch = next(
        (b for b in branches if f"== '{leave_type}'" in (b.get("when") or "")),
        None,
    )
    if not branch:
        raise ValueError(f"假别 {leave_type} 不在 type_router 分支里")

    # 找当前链所有节点(从 branch.next 开始 BFS,只收 id 以 leave_type_ 开头的)
    old_chain_ids: set[str] = set()
    queue = [branch.get("next")]
    while queue:
        nid = queue.pop(0)
        if not nid or nid in ("approved", "rejected") or nid in old_chain_ids:
            continue
        if not nid.startswith(leave_type + "_"):
            continue
        old_chain_ids.add(nid)
        n = next((x for x in nodes if x.get("id") == nid), None)
        if not n:
            continue
        if n.get("type") == "approval":
            queue.append(n.get("next"))
        elif n.get("type") == "condition":
            for b in n.get("branches") or []:
                queue.append(b.get("next"))

    # 删旧链
    cfg["nodes"] = [n for n in nodes if n.get("id") not in old_chain_ids]

    # 建新链
    new_chain = _build_chain_for_leave_type(leave_type, tiers)
    if not new_chain:
        raise ValueError(f"tier 列表为空,无法重建 {leave_type} 链")

    # 插到 approved end 节点之前
    nodes_list = cfg["nodes"]
    end_idx = next(
        (i for i, n in enumerate(nodes_list) if n.get("id") == "approved"),
        len(nodes_list),
    )
    nodes_list[end_idx:end_idx] = new_chain

    # 更新 type_router 分支指向新链入口
    branch["next"] = new_chain[0]["id"]


def _apply_op(cfg: dict, op: dict) -> None:
    """根据 op_type 分发到具体 apply 函数。op 内字段命名贴合 LLM 输出。"""
    op_type = op.get("op")
    if op_type == "set_chain":
        leave_type = op.get("leave_type")
        tiers = op.get("tiers") or []
        if not leave_type or not isinstance(tiers, list) or not tiers:
            raise ValueError("set_chain 需要 leave_type + 非空 tiers")
        # 校验 roles 都在合法集合里
        for tier in tiers:
            for r in tier.get("roles") or []:
                if r not in VALID_ROLES:
                    raise ValueError(f"角色 {r} 不在系统支持列表内({sorted(VALID_ROLES)})")
        _apply_set_chain(cfg, leave_type, tiers)
        return
    if op_type == "complex_rewrite":
        # LLM 自己重写整 YAML 的兜底路径,直接覆盖 cfg(在外层调用方处理)
        raise NotImplementedError("complex_rewrite 由调用方直接处理")
    raise ValueError(f"不支持的 op: {op_type}")


# ---------- propose endpoint ----------

class ProposeReq(BaseModel):
    biz_type: str = Field(..., description="leave / leave_return / 后续业务")
    college_id: int | None = None
    instruction: str = Field(..., min_length=1, max_length=500, description="老师说的自然语言")


class AmbiguityCandidate(BaseModel):
    """歧义候选项 — 用户点选后,前端把 label 拼到原 instruction 重发 /propose。"""
    id: str
    label: str
    desc: str


class ProposeResp(BaseModel):
    ok: bool
    new_yaml: str | None = None
    diff_zh: str | None = None
    change_summary: str | None = None
    ai_message: str
    error_code: str | None = None
    # 提案涉及的假别 code(如 ["official"])。前端拿到后滚动到 #leave-type-{code} 卡 + 高亮。
    # 删除假别 / 新增假别也填,前端找不到 DOM 时静默跳过。
    focus_codes: list[str] | None = None
    # 改动语义分类(deterministic,sidecar 算出来,不是 LLM 自己说的)。前端在提案卡顶部
    # 高亮显示这个 label,防止 AI 把"上限"理解成"分档阈值"而老师没看出来就点了确认。
    # code 见 _categorize_ops;label 是给老师看的中文。
    change_category: str | None = None
    change_category_label: str | None = None
    # 歧义澄清:LLM 检测到老师指令在系统里有 ≥2 种等可能解读时,不直接 propose,
    # 而是把候选项列出来让老师二选一。前端渲染 button list,点选后把 label 拼到
    # instruction 重发一次 /propose,这次不再触发歧义分支。
    ambiguity_question: str | None = None
    ambiguity_candidates: list[AmbiguityCandidate] | None = None


SYSTEM_PROMPT = """你是工作流配置助手。给定 YAML 工作流定义 + 老师指令,你输出**结构化 op**(JSON),
Python 代码会拿 op 在 YAML AST 上精确修改。**禁止直接输出 YAML**(除 complex_rewrite 兜底场景)。

# 系统已有的合法角色 code(中文 ↔ code 映射,只能用这些)
- 辅导员 → counselor
- 班主任 → class_master
- 班长 → class_monitor
- 院系管理员 → college_admin
- 院系书记 → college_secretary
- 院系领导 → dean
- 学工处人员 → student_affairs_officer
- 学工部部长 → student_affairs_director
- 校级管理员 → school_admin
**禁止编造其它 role code**。老师提的角色不在表内 → needs_clarification。

# 支持的 op 类型

## 1. set_chain — 改某假别的整套审批分档(最常用,覆盖 ~80% 改动)
适用:改 N 天阈值 / 改某档审批人 / 加档 / 删档 / 反正只动一个假别的链。
入参:
  - leave_type:假别 code(必须在当前 type_router 里存在)
  - tiers:数组,每项 {threshold: int|null, roles: [role_code]}
    - threshold 是该档**上限天数**(<= 该值落在本档),最后一档 threshold 必须为 null
    - roles 是**累积**的角色列表(包含前面所有 tier 的角色 + 本档新加的)

**关键铁律(违反就是错):**

(1) 【加档 / 改某档角色】场景下,必须保留既有所有档的 threshold + roles 不变,不准合并相邻档。
(2) 老师说"加 X 在 N 天以上",新角色 X 只加在 >N 那档,**绝不倒灌到 ≤N 档**。
    既有档的 roles 必须跟当前 YAML 一字不差。
(3) 【删档 / truncate】场景 — **跟铁律 (1) 反方向**,这里就是要把 tier 删掉:
    凡识别到 "删除 N 天以上 / 砍掉 N 天以上 / 移除 N+ 的流程 / 公假上限改成 N 天 / 封顶 N / 最多 N 天" 等意图,
    一律按 truncate 处理(**不是**只删最末一档):
    a) 把 threshold > N 的所有档**全部**从 tiers 数组里**剔除**(包括末档 threshold=null 的那一档,如果它代表的就是 >N 区间)
    b) 留下的档里,**最后一档的 threshold 必须改成 null**(它现在是新封顶)
    c) 各档的 roles 保持原样,**不要**给末档新增"封顶"专属角色

例 — 当前: 0-2/2-7/7-10/10-15 各档 / 15+ 5 角色
老师:"删除公假 10 天以上的流程"(= truncate at 10)

✅ 正确 tiers(只剩 3 档,末档 threshold=null):[
  {"threshold":2, "roles":["counselor"]},
  {"threshold":7, "roles":["counselor","dean"]},
  {"threshold":null, "roles":["counselor","dean","student_affairs_officer"]}
]

❌ 错误一(只删最末档,留了 10+ 的档):[
  {"threshold":2,"roles":[...]}, {"threshold":7,"roles":[...]},
  {"threshold":10,"roles":[...]}, {"threshold":null,"roles":["counselor","dean","student_affairs_officer","student_affairs_director"]}
]

❌ 错误二(把末档 threshold 设成 15 / 留个上限档):[
  {"threshold":2,...},{"threshold":7,...},{"threshold":10,...},{"threshold":15,...}
]
                                                       ↑ 还是有 10 天以上的档,truncate 失败

例 — 当前: 0-2 辅导员 / 2-7 辅导员+院系领导 / 7+ 辅导员+院系领导
老师:"加 7 天以上学工处人员,上限 10 天"(这是加档场景,套铁律 1)

✅ 正确 tiers:[
  {"threshold":2, "roles":["counselor"]},                           ← 跟现状一致
  {"threshold":7, "roles":["counselor","dean"]},                    ← 跟现状一致
  {"threshold":10,"roles":["counselor","dean","student_affairs_officer"]}
]

❌ 错误一(把 2-7 档吃掉,合并成 2-10):[
  {"threshold":2, "roles":["counselor"]},
  {"threshold":10,"roles":["counselor","dean","student_affairs_officer"]}
]

❌ 错误二(把学工处人员倒灌进 2-7 档):[
  {"threshold":2, "roles":["counselor"]},
  {"threshold":7, "roles":["counselor","dean","student_affairs_officer"]},  ← 不该加
  {"threshold":10,"roles":["counselor","dean","student_affairs_officer"]}
]

举例:"事假改成最多 7 天,0-3 班主任,3-7 加辅导员"
{
  "op": "set_chain",
  "leave_type": "personal",
  "tiers": [
    {"threshold": 3, "roles": ["class_master"]},
    {"threshold": null, "roles": ["class_master", "counselor"]}
  ]
}

举例:"因公外出加分档:≤2 天班主任,>2 天班主任→辅导员→院系书记顺序审批,上限 20"
{
  "op": "set_chain",
  "leave_type": "official",
  "tiers": [
    {"threshold": 2, "roles": ["class_master"]},
    {"threshold": 20, "roles": ["class_master", "counselor", "college_secretary"]}
  ]
}

举例:"删除公假 10 天以上的流程"(truncate 场景,当前 5 档 0-2/2-7/7-10/10-15/15+)
{
  "op": "set_chain",
  "leave_type": "official_business",
  "tiers": [
    {"threshold": 2, "roles": ["counselor"]},
    {"threshold": 7, "roles": ["counselor","dean"]},
    {"threshold": null, "roles": ["counselor","dean","student_affairs_officer"]}
  ]
}
关键观察:tiers 从 5 个**减少到 3 个**,原本 threshold=10 的档保留(它的范围 7-10 还在合法区间),
原本 threshold>10 的两档(10-15 和 15+)整体丢弃,新末档把 threshold 改成 null。

## 2. set_term_cap — 改「全学期累计请假上限」(全部假别合计)
适用:老师说「全校学期最多请 X 天」「学期累计上限改 Y」「去掉学期上限」。
V096 起从 per-假别上限改成租户级单一上限,行为是软警告 + 高风险标记,不阻断学生提交。
**这条 op 不动 YAML 流程**,只改 leave_global_config 表的 term_max_days 字段。
入参:
  - days:数值,全学期累计上限;**0 或 null 表示去掉上限(不限)**
  - leave_type:可选,若老师按假别说出来仍接受这个字段但**忽略**(全局口径下没有"按假别")

举例:"学期累计请假最多 15 天"
{"op": "set_term_cap", "days": 15}

举例:"去掉学期上限"
{"op": "set_term_cap", "days": null}

## 3. set_leave_type_enabled — 停用 / 启用 某假别(不动 YAML 工作流)
适用:老师说「停用公假」「关掉病假」「重新启用婚假」等仅切换可见性的指令。
**这条 op 不动 YAML**,只调 backend PUT /api/v1/leave-types/{code}/enabled 翻数据库一行,
学生端 /leave-types 列表自动不再返回该 code,因此申请请假看不到这个假别;
管理端「请假规则」页仍展示卡片(用 已停用 tag 区分),便于以后再启用。
入参:
  - leave_type:假别 code(必须在当前 type_router 里存在)
  - enabled:true=启用 / false=停用

举例:"停用公假"
{"op": "set_leave_type_enabled", "leave_type": "official_business", "enabled": false}

举例:"重新启用婚假"
{"op": "set_leave_type_enabled", "leave_type": "marriage", "enabled": true}

## 4. complex_rewrite — 兜底(LLM 自己重写整 YAML)
适用:**真**需要新增假别 / 改 form 字段 / 改销假流程 / 改 type_router / 任何 set_chain/set_term_cap/set_leave_type_enabled 表达不了的。
注意:停用/启用 假别**绝不要**走 complex_rewrite——用 set_leave_type_enabled 即可,
否则会破坏 YAML 节点引用,且不会让学生端真正看不见。
入参:
  - new_yaml:完整新 YAML 文本

# 歧义检测 — 仅对"上限/封顶/最多"类指令触发,避免 AI 把"硬上限"误解成"分档阈值"

老师说"把 X 天数上限改成 N"时,「上限」在请假规则里可能指 3 种不同的东西:
  a) 硬上限(单次请假超过 N 天直接不允许提交)
  b) 审批分档最高档阈值(N 天以上要走更多人审批,N 天以内少走一档)
  c) 全学期累计上限(整学期所有假合计 ≤ N 天,软警告不阻断)

**满足以下所有条件**时,**不要直接 propose**,改返回歧义候选让老师二选一:
  - 指令含"上限 / 封顶 / 最多 / 不能超过"等模糊词
  - 没有"硬""分档""最高一档""分档阈值""学期累计 / 学期总共"等限定词
  - 提到了具体天数

输出:
{
  "needs_ambiguity_clarification": true,
  "ambiguity_question": "<反问。如『你说的「上限」是哪一种?』>",
  "ambiguity_candidates": [
    {"id": "hard_cap",        "label": "硬上限(单次请假超过 N 天不允许)",   "desc": "禁止学生提交超期申请"},
    {"id": "tier_threshold",  "label": "审批最高档阈值(N 天以上走 3 级审批)", "desc": "改 set_chain 分档"},
    {"id": "term_cap",        "label": "全学期累计上限(整学期总共 N 天)",     "desc": "改 set_term_cap"}
  ],
  "ai_message": "<≤80 字的中文反问,告诉老师选了哪种就执行哪种>",
  "change_summary": "<≤30 字,等待澄清>"
}

老师已经用"最高一档 / 分档阈值 / 硬上限 / 学期累计"等明确词时,**不要触发歧义分支**,直接出 ops。

# 输出格式 — 严格 JSON,无 markdown
信息齐全:
{
  "needs_clarification": false,
  "ops": [{...}, {...}],
  "diff_zh": "<3-5 行中文 bullet,**只用中文角色名**>",
  "change_summary": "<≤30 字中文摘要>",
  "ai_message": "<≤80 字给老师的中文反馈>",
  "focus_codes": ["<本次改动涉及的假别 code,如 official / personal / sick>"]
}

# focus_codes 规则
- 只填本次 ops 实际改动的假别 code,不要把 YAML 里其它没动的假别也列进来
- 多个假别一起改时,按改动重要程度从前往后,前端会滚动到第一个
- 整体改动(如改 form 字段)无明确假别时,留空数组 []
- 必须用 code(英文),不要中文名

信息不全 / 角色不在系统:
{
  "needs_clarification": true,
  "ai_message": "<反问。例如:『新增公假需要明确:① 上限多少天 ② 由哪些角色审批(系统支持:班长/班主任/辅导员/院系书记/院系领导/学工处人员/学工部部长/校级管理员)。请补充。』>",
  "change_summary": "<≤30 字>"
}

# 严禁
- diff_zh 出现英文 role code(必须中文:班主任/辅导员/...)
- 编造系统不支持的角色
- 老师没要求时擅自加证明 / 改其他假别
- 输出 markdown 代码块或额外解释
- **set_term_cap / set_leave_type_enabled 不能跟 set_chain / complex_rewrite 在同一个 ops 数组里混用**(实现限制),
  老师同时要改两件时,优先按指令里更明确的那一项做,另一项可以在 ai_message 提示「请单独再说一次」
"""


def _extract_old_tiers(cfg: dict, leave_type: str) -> list[dict]:
    """从 cfg(已 yaml.safe_load 的 dict)反推某假别现在的 tiers 结构,跟
    `_build_chain_for_leave_type` 的输出格式对齐:list[{threshold, roles}]。
    用于改动前后对比,推出"分档阈值调整 / 加档 / 删档 / 改审批角色"等语义分类。
    走不到目标假别(找不到 router branch)时返回空数组。
    """
    nodes = cfg.get("nodes") or []
    router_node = next((n for n in nodes if n.get("id") == "type_router"), None)
    if not router_node:
        return []
    branches = router_node.get("branches") or []
    branch = next(
        (b for b in branches if f"== '{leave_type}'" in (b.get("when") or "")),
        None,
    )
    if not branch:
        return []

    tiers: list[dict] = []
    accumulated_roles: list[str] = []
    nid = branch.get("next")
    visited: set[str] = set()
    while nid and nid not in ("approved", "rejected"):
        if nid in visited:
            break  # cycle 保护,正常 YAML 不会出现
        visited.add(nid)
        node = next((n for n in nodes if n.get("id") == nid), None)
        if not node:
            break
        if node.get("type") == "approval":
            role = (node.get("assignee") or {}).get("role")
            if role:
                accumulated_roles.append(role)
            nid = node.get("next")
        elif node.get("type") == "condition":
            threshold: int | None = None
            default_next: str | None = None
            for b in node.get("branches") or []:
                w = b.get("when") or ""
                if "duration_days <=" in w:
                    try:
                        threshold = int(w.split("<=")[1].strip())
                    except (ValueError, IndexError):
                        pass
                if w == "default":
                    default_next = b.get("next")
            tiers.append({"threshold": threshold, "roles": list(accumulated_roles)})
            nid = default_next
        else:
            break
    tiers.append({"threshold": None, "roles": list(accumulated_roles)})
    return tiers


def _categorize_set_chain(old_tiers: list[dict], new_tiers: list[dict]) -> tuple[str, str]:
    """对比一对 tiers 列表,推出本次 set_chain 的语义分类。
    用户在提案卡上看到 label 一眼就能判断 AI 是不是按预期的维度改的。
    """
    old_n = len(old_tiers)
    new_n = len(new_tiers)
    if new_n > old_n:
        return ("tier_add", "新增审批分档")
    if new_n < old_n:
        return ("tier_truncate", "分档裁剪(降低封顶)")
    old_thr = [t.get("threshold") for t in old_tiers]
    new_thr = [t.get("threshold") for t in new_tiers]
    old_roles = [tuple(t.get("roles") or []) for t in old_tiers]
    new_roles = [tuple(t.get("roles") or []) for t in new_tiers]
    thr_changed = old_thr != new_thr
    roles_changed = old_roles != new_roles
    if thr_changed and not roles_changed:
        return ("threshold_adjustment", "分档阈值调整(不改硬上限)")
    if roles_changed and not thr_changed:
        return ("approver_chain_adjustment", "审批角色调整")
    if thr_changed and roles_changed:
        return ("chain_rewrite", "审批链重写(阈值 + 角色)")
    return ("set_chain_no_change", "无实际改动")


def _categorize_ops(
    ops: list[dict],
    old_cfg: dict | None,
) -> tuple[str | None, str | None]:
    """根据 ops + 改动前 cfg 推出本次提案的分类。多 op 走 mixed 兜底。"""
    if not ops:
        return (None, None)
    if all(op.get("op") == "set_term_cap" for op in ops):
        return ("term_cap_adjustment", "全学期累计上限调整")
    if all(op.get("op") == "set_leave_type_enabled" for op in ops):
        all_disable = all(op.get("enabled") is False for op in ops)
        all_enable = all(op.get("enabled") is True for op in ops)
        if all_disable:
            return ("leave_type_disable", "停用假别")
        if all_enable:
            return ("leave_type_enable", "启用假别")
        return ("leave_type_toggle", "假别启停(批量)")
    if len(ops) == 1 and ops[0].get("op") == "complex_rewrite":
        return ("complex_rewrite", "复杂改动(整体重写)")
    if all(op.get("op") == "set_chain" for op in ops):
        if old_cfg is None:
            return ("chain_rewrite", "审批链调整")
        # 多个 set_chain 不同假别:取主导分类(以第一个为代表,加批量提示)
        cats: list[tuple[str, str]] = []
        for op in ops:
            lt = op.get("leave_type")
            new_tiers = op.get("tiers") or []
            old_tiers = _extract_old_tiers(old_cfg, lt) if lt else []
            cats.append(_categorize_set_chain(old_tiers, new_tiers))
        unique_codes = {c[0] for c in cats}
        if len(unique_codes) == 1:
            return cats[0]
        return ("chain_rewrite", "多假别审批链调整")
    return ("mixed", "多类配置调整")


def _de_role_code(text: str) -> str:
    """diff_zh 后置中文化:残留英文 role code 替换成中文。"""
    for code, zh in ROLE_ZH.items():
        text = text.replace(code, zh)
    return text


def _render_set_chain_diff(leave_type_zh: str, tiers: list[dict]) -> str:
    """按 tiers 数组逐档输出中文 diff bullet。不信任 LLM 的 diff_zh,因为 LLM 经常
    把"0-2 / 2-7 / 7+"描述成"0-2 / 2-7+"等合并形式,误导老师。本函数对每一档单独渲染:
      - 第 1 档 0-{t1}:roles
      - 第 i 档 {t(i-1)}-{ti}:roles
      - 末档 {t_last_threshold}+:roles(threshold=null 时)或 {t_prev}-{t_last}:roles(有 threshold)
    """
    if not tiers:
        return f"- 「{leave_type_zh}」清空了审批链(无任何档)"
    lines = [f"- 「{leave_type_zh}」分档调整为:"]
    prev = 0
    for i, tier in enumerate(tiers):
        threshold = tier.get("threshold")
        roles = tier.get("roles") or []
        roles_zh = " → ".join(ROLE_ZH.get(r, r) for r in roles) or "(无审批人)"
        # 跟 LeaveConfigSummaryService 对齐:中文范围,边界唯一
        if threshold is None:
            label = f"  · {prev} 天以上"
        elif i == 0:
            label = f"  · {threshold} 天以内"
        else:
            label = f"  · {prev} 天以上,{threshold} 天以内"
        lines.append(f"{label}:{roles_zh}")
        if threshold is not None:
            prev = threshold
    return "\n".join(lines)


@router.post("/propose", response_model=ProposeResp)
async def propose(
    req: ProposeReq,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default="default"),
    x_user_role: str = Header(default="school_admin"),
    authorization: str = Header(default=""),
) -> ProposeResp:
    # 销假改造后没有 leave_return YAML — 默认链路是「学生 GPS 销假 + 人工兜底」,
    # 老师能改的就是校园围栏(中心 + 半径)。引导去配置页改即可,本 LLM 路径不接。
    if req.biz_type == "leave_return":
        return ProposeResp(
            ok=False,
            ai_message=(
                "销假规则已不走审批流。学生在小程序点「我已返校」由 GPS 自动判定,"
                "围栏外可申请人工销假。要改围栏中心或半径,请到「请销假配置 - 销假」"
                "页直接编辑。"
            ),
            error_code="LEAVE_RETURN_NOT_CONFIGURABLE_HERE",
        )

    headers = {
        "X-User-Id": x_user_id or "0",
        "X-Tenant-Id": x_tenant_id or "default",
        "X-User-Role": x_user_role or "school_admin",
    }
    # 透传浏览器登录态 — Sa-Token 全局拦截器要求 Authorization,空 token 一律 401
    if authorization:
        headers["Authorization"] = authorization

    # 1) 拉当前 YAML + 假别中文 code/name 映射(注入 prompt 防止 LLM 把"因公外出"误猜成 official_business)
    leave_type_map: list[dict] = []
    try:
        async with httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False) as c:
            params: dict[str, Any] = {"biz_type": req.biz_type}
            if req.college_id is not None:
                params["college_id"] = req.college_id
            r = await c.get("/api/v1/workflow-config/yaml", headers=headers, params=params)
            r.raise_for_status()
            data = r.json().get("data", {})
            current_yaml = data.get("yaml")
            current_version = data.get("version")
            # 拉假别映射(只在 leave 时有意义)
            if req.biz_type == "leave":
                try:
                    r2 = await c.get("/api/v1/leave-types", headers=headers)
                    if r2.status_code == 200:
                        for t in (r2.json().get("data") or []):
                            code = t.get("code")
                            name = t.get("name")
                            if code and name:
                                leave_type_map.append({"code": code, "name": name})
                except Exception:
                    logger.warning("propose: fetch leave-types map failed; LLM 自己猜 code")
    except Exception as e:
        logger.exception("propose: read current yaml failed")
        return ProposeResp(ok=False, ai_message=f"读取当前配置失败:{e}", error_code="READ_FAILED")

    if not current_yaml:
        return ProposeResp(
            ok=False,
            ai_message=f"{req.biz_type} 还没有发布过配置,无法改动。请先用「高级模式」创建初版。",
            error_code="NO_CURRENT_YAML",
        )

    # 2) LLM 出 op
    type_map_block = ""
    if leave_type_map:
        lines = [f"  - {t['name']} → {t['code']}" for t in leave_type_map]
        type_map_block = "# 当前已有假别(中文 → code,严格按这个映射,不要瞎猜)\n" + "\n".join(lines) + "\n\n"
    user_msg = (
        f"{type_map_block}"
        f"# 当前 YAML(v{current_version})\n```yaml\n{current_yaml}\n```\n\n"
        f"# 老师指令\n{req.instruction}"
    )
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=4000,
        )
    except Exception as e:
        logger.exception("propose: LLM failed")
        return ProposeResp(ok=False, ai_message=f"AI 解析失败:{e}", error_code="LLM_FAILED")

    # 3) 解析 LLM 输出
    raw = (turn.text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        nl = raw.find("\n")
        if nl >= 0:
            raw = raw[nl + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("propose: LLM JSON parse failed: %s, raw[:300]=%s", e, raw[:300])
        return ProposeResp(
            ok=False,
            ai_message="AI 输出格式异常,请换种说法再试",
            error_code="LLM_BAD_OUTPUT",
        )

    if parsed.get("needs_ambiguity_clarification"):
        raw_candidates = parsed.get("ambiguity_candidates") or []
        candidates: list[AmbiguityCandidate] = []
        for c in raw_candidates:
            if not isinstance(c, dict):
                continue
            cid = c.get("id")
            clabel = c.get("label")
            cdesc = c.get("desc") or ""
            if isinstance(cid, str) and isinstance(clabel, str) and cid and clabel:
                candidates.append(AmbiguityCandidate(id=cid, label=clabel, desc=cdesc))
        if len(candidates) >= 2:
            return ProposeResp(
                ok=False,
                ai_message=parsed.get("ai_message") or "你说的可能是几种解读,请选一个。",
                change_summary=parsed.get("change_summary") or "等待澄清",
                error_code="NEEDS_AMBIGUITY_CLARIFICATION",
                ambiguity_question=parsed.get("ambiguity_question") or "请确认你的意图:",
                ambiguity_candidates=candidates,
            )
        # 候选少于 2 个走不通,退化到普通澄清提示
        logger.warning("propose: ambiguity branch with <2 valid candidates, falling back")

    if parsed.get("needs_clarification"):
        return ProposeResp(
            ok=False,
            ai_message=parsed.get("ai_message") or "请补充更多信息。",
            change_summary=parsed.get("change_summary") or "等待补充信息",
            error_code="NEEDS_CLARIFICATION",
        )

    # diff_zh 容错:LLM 偶发把它输出成 list[str](bullets 数组)而不是字符串,
    # 直接进 _de_role_code 会 AttributeError。统一 coerce 成 string。
    raw_diff = parsed.get("diff_zh")
    if isinstance(raw_diff, list):
        raw_diff = "\n".join(str(x) for x in raw_diff)
    elif raw_diff is None:
        raw_diff = "(AI 未给出 diff 描述)"
    elif not isinstance(raw_diff, str):
        raw_diff = str(raw_diff)
    diff_zh = _de_role_code(raw_diff)
    change_summary = parsed.get("change_summary") or req.instruction[:30]
    ai_message = parsed.get("ai_message") or "已生成改动建议,请审核后确认。"

    # focus_codes 三级 fallback:LLM 直出 → ops.leave_type → 扫指令文本里的中文假别名
    valid_codes = {t["code"] for t in leave_type_map} if leave_type_map else set()
    raw_focus = parsed.get("focus_codes") or []
    if not isinstance(raw_focus, list):
        raw_focus = []
    if not raw_focus:
        raw_focus = [op.get("leave_type") for op in (parsed.get("ops") or []) if op.get("leave_type")]
    if not raw_focus and leave_type_map:
        # 老师指令里若提到"事假/病假/公假"等中文名,定位到对应 code
        instr = req.instruction or ""
        for t in leave_type_map:
            name = t.get("name") or ""
            if name and name in instr:
                raw_focus.append(t["code"])
    focus_codes = [c for c in raw_focus if isinstance(c, str) and (not valid_codes or c in valid_codes)]
    # 去重保序
    focus_codes = list(dict.fromkeys(focus_codes))

    # 4) 应用 op 到 YAML AST
    try:
        cfg = yaml.safe_load(current_yaml) or {}
    except yaml.YAMLError as e:
        return ProposeResp(ok=False, ai_message=f"当前 YAML 解析失败:{e}", error_code="CURRENT_YAML_BAD")

    ops = parsed.get("ops") or []
    if not isinstance(ops, list) or not ops:
        return ProposeResp(
            ok=False,
            ai_message="AI 没给出 op,请换种说法",
            error_code="NO_OPS",
        )

    # 全部是 set_term_cap → 不动 YAML,直接调 backend 改 leave_global_config 表(全局单行)
    # V096 起从 per-假别 改成租户级一条上限;同一批多条 set_term_cap 时取最后一条的 days,
    # 因为语义已经不分假别,前面那些会被覆盖。
    if all(op.get("op") == "set_term_cap" for op in ops):
        days = ops[-1].get("days")
        # days=0/null/负数 都视为「去掉上限」
        payload_days = None if days is None or (isinstance(days, (int, float)) and days <= 0) else days
        async with httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False) as c:
            try:
                r = await c.put(
                    "/api/v1/leaves/global-config",
                    headers=headers,
                    json={"term_max_days": payload_days},
                )
                if r.status_code != 200:
                    body = r.text[:200]
                    return ProposeResp(
                        ok=False,
                        ai_message=f"应用失败:{body}",
                        error_code="BACKEND_REJECT",
                    )
            except Exception as e:
                logger.exception("set_term_cap call failed")
                return ProposeResp(ok=False, ai_message=f"调用后端失败:{e}", error_code="BACKEND_FAIL")
        applied = "不限" if payload_days is None else f"{payload_days} 天"
        cat_code, cat_label = _categorize_ops(ops, cfg)
        return ProposeResp(
            ok=True,
            new_yaml=None,
            diff_zh=diff_zh,
            change_summary=change_summary,
            ai_message=ai_message or f"✓ 已设置全学期累计上限:{applied}",
            focus_codes=focus_codes or None,
            change_category=cat_code,
            change_category_label=cat_label,
        )

    # 全部是 set_leave_type_enabled → 不动 YAML,逐个调 backend PUT 翻 leave_type_config.enabled。
    # 学生端 /leave-types(默认 enabled-only) 因此立刻不再看到停用的假别;管理端拿 include_disabled
    # 仍能看到卡(标灰 + 已停用 tag),便于后续再启用。focus_codes 取所有切换的 code。
    if all(op.get("op") == "set_leave_type_enabled" for op in ops):
        toggled_codes: list[str] = []
        async with httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False) as c:
            for op in ops:
                lt = op.get("leave_type")
                en = op.get("enabled")
                if not isinstance(lt, str) or not lt:
                    return ProposeResp(ok=False, ai_message="set_leave_type_enabled 缺 leave_type", error_code="OP_BAD")
                if not isinstance(en, bool):
                    return ProposeResp(ok=False, ai_message="set_leave_type_enabled 缺 enabled(true/false)", error_code="OP_BAD")
                if valid_codes and lt not in valid_codes:
                    return ProposeResp(
                        ok=False,
                        ai_message=f"假别 code「{lt}」不在当前规则里,请用现有 code(可见{sorted(valid_codes)})",
                        error_code="UNKNOWN_LEAVE_TYPE",
                    )
                try:
                    r = await c.put(
                        f"/api/v1/leave-types/{lt}/enabled",
                        headers=headers,
                        json={"enabled": en},
                    )
                    if r.status_code != 200:
                        return ProposeResp(
                            ok=False,
                            ai_message=f"应用失败:{r.text[:200]}",
                            error_code="BACKEND_REJECT",
                        )
                except Exception as e:
                    logger.exception("set_leave_type_enabled call failed")
                    return ProposeResp(ok=False, ai_message=f"调用后端失败:{e}", error_code="BACKEND_FAIL")
                toggled_codes.append(lt)
        # 翻完后用切换中的 code 兜底 focus(LLM 不输 focus_codes 时也能定位)
        toggled_focus = focus_codes or list(dict.fromkeys(toggled_codes))
        # ai_message 用我们生成的更靠谱版本(LLM 容易遗漏哪些是停用 / 启用)
        zh_pairs = []
        for op in ops:
            lt = op.get("leave_type")
            en = op.get("enabled")
            zh = next((t["name"] for t in leave_type_map if t["code"] == lt), lt)
            zh_pairs.append(f"{'启用' if en else '停用'}「{zh}」")
        cat_code, cat_label = _categorize_ops(ops, cfg)
        return ProposeResp(
            ok=True,
            new_yaml=None,
            diff_zh=" / ".join(zh_pairs),
            change_summary=change_summary or " / ".join(zh_pairs),
            ai_message="✓ " + "、".join(zh_pairs)
                + "。学生端列表已即时刷新,工作流配置不变。",
            focus_codes=toggled_focus or None,
            change_category=cat_code,
            change_category_label=cat_label,
        )

    # 检查是不是单 complex_rewrite,如果是直接走整 YAML 路径
    if len(ops) == 1 and ops[0].get("op") == "complex_rewrite":
        new_yaml = ops[0].get("new_yaml")
        if not isinstance(new_yaml, str) or not new_yaml.strip():
            return ProposeResp(
                ok=False,
                ai_message="AI 给的 complex_rewrite 缺 new_yaml",
                error_code="COMPLEX_REWRITE_NO_YAML",
            )
        try:
            new_parsed = yaml.safe_load(new_yaml)
        except yaml.YAMLError as e:
            return ProposeResp(ok=False, ai_message=f"AI 输出 YAML 解析失败:{e}", error_code="LLM_YAML_BAD")
        if not isinstance(new_parsed, dict) or not isinstance(new_parsed.get("nodes"), list):
            return ProposeResp(ok=False, ai_message="AI 输出 YAML 缺 nodes", error_code="LLM_YAML_NO_NODES")
        cfg_after = new_parsed
    else:
        # 跑 op chain(目前只有 set_chain)
        cfg_after = copy.deepcopy(cfg)
        for op in ops:
            try:
                _apply_op(cfg_after, op)
            except Exception as e:
                logger.warning("apply op %s failed: %s", op.get("op"), e)
                return ProposeResp(
                    ok=False,
                    ai_message=f"应用 op 失败:{e}",
                    error_code="OP_APPLY_FAILED",
                )

    # 5) 零改动拦截 — 但仍然 ok=True 把 focus_codes 给前端,让用户看到"你说的这张卡现在长这样"
    #    这种情况绝大多数是"当前规则已经满足要求",不是 AI 翻车,文案要让老师能自己判断。
    if cfg == cfg_after:
        # ops 里能拿到 LLM 实际定位的假别 code(误判时也准 — 老师看到高亮的卡跟自己说的对不上,就会换说法)
        op_codes = [op.get("leave_type") for op in ops if op.get("leave_type")]
        focus_no_change = [c for c in op_codes if isinstance(c, str) and (not valid_codes or c in valid_codes)]
        focus_no_change = list(dict.fromkeys(focus_no_change)) or focus_codes
        # 用 LLM 给的 change_summary 反推现状,而不是死文案
        target_zh = ""
        if focus_no_change and leave_type_map:
            names = [t["name"] for t in leave_type_map if t["code"] in focus_no_change]
            if names:
                target_zh = "「" + " / ".join(names) + "」"
        return ProposeResp(
            ok=False,
            ai_message=(
                f"看了下当前{target_zh or '该假别'}的规则,似乎已经满足你说的要求,无需改动。"
                "我已为你定位到对应的卡片,你确认一下是不是这样。"
                "如果实际想改的不是这个假别(比如公假 vs 因公外出容易混),请直接说假别 code。"
            ),
            change_summary=req.instruction[:30],
            error_code="NO_CHANGE",
            focus_codes=focus_no_change or None,
        )

    # 5.5) set_chain 类 ops:用 ops.tiers 重建 diff_zh,不信 LLM 描述
    #      LLM 常把"0-2/2-7/7+"合并成"0-2/2-10",老师读 diff 卡看不出区别就误点应用。
    #      sidecar 拿同一份 tiers 算出来的 diff 跟实际落地 100% 一致,没法被忽悠。
    if ops and all(op.get("op") == "set_chain" for op in ops):
        rendered_lines = []
        for op in ops:
            lt = op.get("leave_type")
            tiers = op.get("tiers") or []
            lt_zh = next((t["name"] for t in leave_type_map if t["code"] == lt), lt or "未知假别")
            rendered_lines.append(_render_set_chain_diff(lt_zh, tiers))
        diff_zh = "\n".join(rendered_lines)

    # 6) dump 回 YAML
    try:
        new_yaml_text = yaml.safe_dump(cfg_after, allow_unicode=True, sort_keys=False)
    except Exception as e:
        return ProposeResp(ok=False, ai_message=f"YAML 序列化失败:{e}", error_code="YAML_DUMP_FAILED")

    cat_code, cat_label = _categorize_ops(ops, cfg)
    return ProposeResp(
        ok=True,
        new_yaml=new_yaml_text,
        diff_zh=diff_zh,
        change_summary=change_summary,
        ai_message=ai_message,
        focus_codes=focus_codes or None,
        change_category=cat_code,
        change_category_label=cat_label,
    )
