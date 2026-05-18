"""确定性危机判定器（无 AI、跑在 LLM 调用之前）。

设计见 `危机求助快速通道-设计方案.md` §3-§4 / 附录 B。判定**不由 LLM 产生**，
是纯函数：先过 ③④ 排除，再过 ①② 正向；**绝不对单字匹配**（机械上 len<2 跳过）。
词表为空（wordlist.py，D2 待定稿）→ 永不命中，这是默认安全态。
"""
from dataclasses import dataclass

from app.agent.crisis import wordlist


@dataclass(frozen=True)
class CrisisHit:
    rule_version: str
    category: str  # "safety" | "basic_needs"
    # 命中的 pattern（仅用于日志/回溯；**不是学生原话**，设计 §5 隐私）
    matched_pattern: str


def _phrases(items: list[str]) -> list[str]:
    # 机械拒绝单字：附录 B 铁律"绝不对死/药/跳单字匹配"。
    return [p for p in items if p and len(p) >= 2]


def detect(message: str | None) -> CrisisHit | None:
    """显式求助命中 → CrisisHit；否则 None。纯函数，无副作用，无网络，无 LLM。"""
    if not message:
        return None
    text = message.strip()
    if not text:
        return None

    # ③④ 排除优先：命中任一排除短语 → 直接放行（不触发），解决习语/辱骂误报。
    for p in _phrases(wordlist.EXCLUDE_IDIOM) + _phrases(wordlist.EXCLUDE_PERSON):
        if p in text:
            return None

    # ① L2-S 安全危机
    for p in _phrases(wordlist.POSITIVE_SAFETY):
        if p in text:
            return CrisisHit(wordlist.RULE_VERSION, "safety", p)

    # ② L2-B 基本生存求助
    for p in _phrases(wordlist.POSITIVE_BASIC):
        if p in text:
            return CrisisHit(wordlist.RULE_VERSION, "basic_needs", p)

    return None
