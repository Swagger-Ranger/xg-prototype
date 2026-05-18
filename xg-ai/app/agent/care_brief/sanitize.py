"""Care brief 输出 sanitize（PRD §11.3 / §11.4 / §11.5）。

纯函数，无 LLM、无 IO，便于单测。语义对齐 §11.4 的 sanitize_result：

- ``blocked``  : 出现诊断/风险性词汇（任意字段），或命令/决策性词汇出现在
  ``why`` 这条核心叙述里 —— Java 侧留痕但不展示，前端显示「建议生成失败」。
- ``redacted`` : 命令/决策性词汇只出现在列表项里 —— 剔除这些条目后仍可展示。
- ``pass``     : 干净。

设计取舍：sanitize 是**安全网而非主防线**，主防线是 §11.2 输入按构造 +
中性 prompt + §11.3 schema。所以词表只收多字、歧义低的词，避免误杀正常文案；
``why`` 命中软词直接 blocked（不做易碎的句子级改写），列表项整条剔除。
"""
from __future__ import annotations

from typing import Any

# 诊断 / 风险性词汇：出现在任意字段即 blocked（不能让 AI 给学生贴风险标签）
HARD_TERMS: tuple[str, ...] = (
    "疑似", "高危", "高风险", "心理风险", "心理危机", "危机干预",
    "自杀", "自残", "轻生", "抑郁症", "焦虑症", "精神病", "精神分裂",
)

# 命令式 / 决策性词汇：在 why 里 blocked，仅在列表里则剔除该条 → redacted
SOFT_TERMS: tuple[str, ...] = (
    "必须", "应当", "请立即", "立刻", "务必", "该生需要",
    "联系家长", "转介心理", "上报学校", "上报学院",
)

_LIST_FIELDS = ("talking_points", "avoid_topics", "campus_resources")


def _has_term(text: str, terms: tuple[str, ...]) -> bool:
    return any(t in text for t in terms)


def sanitize(brief: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """返回 (处理后的 brief, sanitize_result)。

    blocked 时原样返回 brief（§11.4 留痕「完整 AI 输出」，仅前端不展示）；
    redacted 时返回剔除违规列表项后的 brief。
    """
    why = str(brief.get("why") or "")
    list_values: list[str] = []
    for f in _LIST_FIELDS:
        for item in brief.get(f) or []:
            list_values.append(str(item))

    # 1. 诊断/风险词，任意字段命中 → blocked
    if _has_term(why, HARD_TERMS) or any(_has_term(v, HARD_TERMS) for v in list_values):
        return brief, "blocked"

    # 2. 命令/决策词出现在 why 这条核心叙述 → blocked
    if _has_term(why, SOFT_TERMS):
        return brief, "blocked"

    # 3. 命令/决策词只在列表项 → 整条剔除，标记 redacted
    redacted = False
    cleaned = dict(brief)
    for f in _LIST_FIELDS:
        items = brief.get(f) or []
        kept = [it for it in items if not _has_term(str(it), SOFT_TERMS)]
        if len(kept) != len(items):
            redacted = True
            cleaned[f] = kept

    return (cleaned, "redacted") if redacted else (brief, "pass")
