"""请假规则页政策提示 — 国家政策硬编码 + LLM 基于本校知识库提炼可执行配置建议。

紧凑展示在「假别 + 审批链」上方,默认 2 行(国家 1 + 学校 1)。
- 国家:硬编码教育部令条款(字面准确)
- 学校:RAG 召回《本校请假管理办法》等文档 chunks → 喂给 LLM →
  输出 2-3 条**可执行的配置建议**(不是原文片段),每条 ≤25 字 + 来源依据。
  10 min 进程内缓存,避免重复 LLM 调用。
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter
from pydantic import BaseModel

from app.llm.deepseek import DeepSeekProvider
from app.rag.retriever import retrieve_semantic

router = APIRouter(prefix="/leave-policy", tags=["leave-policy"])
logger = logging.getLogger(__name__)


# 国家政策(教育部令)— 极少改,硬编码即可。后续若有人要新增,直接扩这个表。
# 引用必须**字面准确**。源:《普通高等学校学生管理规定》(教育部 41 号令,2017 修订)。
NATIONAL_POLICY: list[dict] = [
    {
        "ref": "教育部 41 号令 第三十条",
        "text": "学生病假停课治疗时间占该学期总学时三分之一以上的,应当休学。",
    },
]

_SCHOOL_HINT_QUERY = "学生请假销假管理办法 病假事假 假期 离校 销假规则"
_CACHE_TTL = 600  # 10 min,本校规章变化频率远低于 10min
_cache: dict[str, tuple[float, list[dict]]] = {}

_LLM_SYSTEM = """你帮高校管理员根据本校请假管理办法,把规章条文翻译成「请销假工作流的可执行配置建议」。

输入:校内规章的若干段原文。
输出:严格 JSON,形如
{"suggestions": [
  {"text": "<≤25 字的配置建议>", "ref": "<原文出处:文档标题(可加条款号)>"},
  ...
]}

要求:
1. 每条建议必须**直接可落实到工作流配置**:涉及天数档、审批人、是否需证明、上限等。例如:
   - "建议病假超 7 天需医院证明"
   - "事假学期累计上限 15 天"
   - "周末离校每学期 8 次封顶"
2. 建议**必须**有规章原文支撑,不能编造。文档没说的不要写。
3. text ≤ 25 字,ref 不要超过 30 字
4. 输出 1-3 条,优先选**可量化、可直接配进 set_chain 的**(天数 / 审批人)
5. 严禁输出原文片段、口号、结语;只输出可操作建议
6. 没有合适的可执行内容 → suggestions 空数组 []
"""


class PolicyItem(BaseModel):
    ref: str
    text: str


class PolicyHints(BaseModel):
    national: list[PolicyItem]
    school: list[PolicyItem]


async def _build_school_suggestions() -> list[dict]:
    """RAG 召回 → 拼 chunks → LLM 提炼 → 返回 [{ref, text}]。空数组表示无可用内容。"""
    cached = _cache.get("school")
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]

    articles = await retrieve_semantic(_SCHOOL_HINT_QUERY, k=5)
    if not articles:
        _cache["school"] = (time.time(), [])
        return []

    # 拼成 markdown 给 LLM,带文档标题,LLM 才能填准确 ref
    chunks_md = "\n\n".join(
        f"## 文档:{(a.doc_title or '本校规定').strip()}\n{(a.body or '').strip()}"
        for a in articles
        if (a.body or "").strip()
    )
    if not chunks_md.strip():
        _cache["school"] = (time.time(), [])
        return []

    try:
        provider = DeepSeekProvider()
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": _LLM_SYSTEM},
                {"role": "user", "content": chunks_md},
            ],
            temperature=0.1,
            max_tokens=600,
        )
        raw = (turn.text or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            nl = raw.find("\n")
            if nl >= 0:
                raw = raw[nl + 1:]
            if raw.endswith("```"):
                raw = raw[:-3]
        import json
        data = json.loads(raw)
        items = data.get("suggestions") or []
        cleaned: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            text = (it.get("text") or "").strip()
            ref = (it.get("ref") or "").strip()
            if text and ref and len(text) <= 40:
                cleaned.append({"text": text, "ref": ref})
        cleaned = cleaned[:3]
    except Exception:
        logger.exception("leave-policy/hints: LLM distill failed; returning empty school list")
        cleaned = []

    _cache["school"] = (time.time(), cleaned)
    return cleaned


@router.get("/hints", response_model=PolicyHints)
async def hints() -> PolicyHints:
    """返回请假规则页紧凑政策提示。失败时只返回国家政策。"""
    national = [PolicyItem(ref=p["ref"], text=p["text"]) for p in NATIONAL_POLICY]
    try:
        school_raw = await _build_school_suggestions()
    except Exception:
        logger.exception("leave-policy/hints: RAG/LLM pipeline failed")
        school_raw = []
    school = [PolicyItem(ref=s["ref"], text=s["text"]) for s in school_raw]
    return PolicyHints(national=national, school=school)
