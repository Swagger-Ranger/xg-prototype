"""L2 危机词表 —— **空配置，D2（心理中心）未定稿前为空**。

设计铁律（`危机求助快速通道-设计方案.md` §3 / D2 / 附录 B）：
- 词表是**心理中心的临床判断，工程不自拟**。本文件四个列表默认 **全空** →
  detector 永不命中 → 通道是"空管子"（设计明示的预期状态，go/no-go 未过）。
- 附录 B 是给心理中心红笔改的 strawman，**不在此自动装载为生产词表**
  （避免拿未经临床审的词表赌命：误报→告警疲劳→漏真案）。
- 词表是**短语 / 共现**，不是危险词清单；detector 机械上拒绝单字（len<2）。

D2 定稿后：心理中心经受控配置注入这四个列表并 bump RULE_VERSION。
"""

# ① L2-S 安全危机 · 正向短语（命中即触发）—— D2 待填
POSITIVE_SAFETY: list[str] = []

# ② L2-B 基本生存求助 · 正向短语 —— D2 待填
POSITIVE_BASIC: list[str] = []

# ③ 习语排除（命中即便含敏感字也不触发）—— D2 待填
EXCLUDE_IDIOM: list[str] = []

# ④ 人称指向排除（非本人求助，如"你去死"）—— D2 待填
EXCLUDE_PERSON: list[str] = []

# 命中时记录的词表版本（不存原文，仅版本，设计 §5）。空表 = v0-empty；
# D2 定稿后改为正式版本号，crisis_signal.rule_version 据此回溯。
RULE_VERSION = "v0-empty"
