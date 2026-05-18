"""L2 危机词表 —— **提交默认全空；经受控配置注入**。

设计铁律（`危机求助快速通道-设计方案.md` §3 / D2 / 附录 B）：
- 词表是**心理中心的临床判断，工程不自拟**。本文件四个列表**提交态恒空** →
  env 未注入时 detector 永不命中 → 通道是"空管子"（设计明示的预期态）。
- 词条**不硬编码在代码里**，由受控配置（环境变量）注入——这正是设计 §3
  "心理中心经受控路径维护配置"的形态。dev/demo 经 gitignored `deploy/.env`
  注入；**生产词表是 D2 定稿，不是这里**。附录 B 仅 strawman，不自动装载。
- 词表是**短语 / 共现**，不是危险词清单；机械上拒绝单字（len<2）。
"""
from app.config import settings


def _parse(raw: str) -> list[str]:
    """逗号分隔 → 短语列表；空白剔除，机械拒单字（设计 §3 / 附录 B 铁律）。"""
    if not raw:
        return []
    return [p for p in (s.strip() for s in raw.split(",")) if len(p) >= 2]


# ① L2-S 安全危机 · 正向短语（命中即触发）—— 注入源 CRISIS_WORDLIST_SAFETY
POSITIVE_SAFETY: list[str] = _parse(settings.crisis_wordlist_safety)

# ② L2-B 基本生存求助 · 正向短语 —— CRISIS_WORDLIST_BASIC
POSITIVE_BASIC: list[str] = _parse(settings.crisis_wordlist_basic)

# ③ 习语排除（命中即便含敏感字也不触发）—— CRISIS_WORDLIST_EXCLUDE_IDIOM
EXCLUDE_IDIOM: list[str] = _parse(settings.crisis_wordlist_exclude_idiom)

# ④ 人称指向排除（非本人求助，如"你去死"）—— CRISIS_WORDLIST_EXCLUDE_PERSON
EXCLUDE_PERSON: list[str] = _parse(settings.crisis_wordlist_exclude_person)

# 命中时记录的词表版本（不存原文，仅版本，设计 §5）。全空 = v0-empty；
# 一旦有注入即标 cfg-injected（dev/demo 或 D2 定稿配置），便于 rule_version 回溯。
RULE_VERSION = "cfg-injected" if (POSITIVE_SAFETY or POSITIVE_BASIC) else "v0-empty"
