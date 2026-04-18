"""Seed institutional documents for knowledge Q&A.

P0 approach: no vector DB, no embeddings. Each policy doc is split into
articles ("第X条") at module load; retrieval scores each article against
the query and returns the top-K across all docs. This gives much tighter
context than full-doc injection once the corpus grows past 2-3 docs.

When the corpus grows past ~30 articles with cross-doc joins, or we need
admin editing, migrate to a `knowledge_chunks` table with pgvector.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class KnowledgeDoc:
    doc_id: str
    title: str
    # Doc-level keywords used to gate the doc in/out for a given query.
    keywords: tuple[str, ...]
    body: str
    articles: list["Article"] = field(default_factory=list)


@dataclass
class Article:
    article_id: str      # e.g. "leave_policy_v1#art3"
    doc_id: str
    doc_title: str
    heading: str         # e.g. "第三条 病假"
    body: str            # heading + content, ready to render


# --------------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------------- #

LEAVE_POLICY = KnowledgeDoc(
    doc_id="leave_policy_v1",
    title="学生请假管理办法",
    keywords=(
        "请假", "销假", "假期", "事假", "病假", "公假", "周末离校",
        "晚归", "未归", "离校", "审批", "天数", "休学",
    ),
    body="""《学生请假管理办法》

第一条 适用范围
本办法适用于本校全体在校本科生。请假分为病假、事假、公假、周末离校四类。

第二条 请假天数与审批权限
1. 3 天（含）以内的请假，由辅导员审批。
2. 3 天以上、7 天（含）以内的请假，由院系领导审批。
3. 7 天以上的请假，由学工处审批。
4. 一学期内累计请假原则上不得超过 30 天；因重大疾病需长期休假的，应办理休学。

第三条 病假
1. 病假需提供校医院或二级以上医院的诊断证明。
2. 离校就医的病假（sick_off_campus）按事假流程审批并须留存家长/监护人联系方式。
3. 在校病假（sick_on_campus）不计入周末离校次数。

第四条 事假
1. 事假原则上一次不超过 5 天，特殊情况需附相关证明。
2. 事假不得用于旅游等非必要事由，经查实可撤回批复并给予纪律处分。

第五条 公假
1. 参加学校组织的比赛、会议、调研等活动可申请公假，需附带活动通知或带队老师证明。
2. 公假不计入累计假期天数。

第六条 周末离校
1. 周末离校需至少提前 1 天在系统中提交申请。
2. 每学期周末离校累计不得超过 8 次，超过需辅导员说明情况后由院系审批。

第七条 销假
1. 假期结束后 24 小时内必须在系统中提交销假。
2. 超期未销假的，由辅导员发起强制销假并记入考勤档案。
3. 连续三次以上未按时销假的，取消下学期奖学金评选资格。

第八条 晚归与未归
1. 晚归（超过宿舍关闭时间 30 分钟内到达）记一次晚归。
2. 未归（超过关闭时间 30 分钟仍未归）按"未归"处理，由辅导员当日联系学生家长。
3. 一学期内晚归累计 3 次或未归 1 次，给予警告处分；累计 5 次晚归或 2 次未归，给予严重警告；再次发生的，给予记过处分。

第九条 附则
本办法自 2024 年 9 月 1 日起执行，由学生工作处负责解释。
""",
)


SCHOLARSHIP_POLICY = KnowledgeDoc(
    doc_id="scholarship_policy_v1",
    title="本科生奖学金评定办法",
    keywords=(
        "奖学金", "评定", "成绩", "学业", "国家奖学金", "综合测评", "绩点",
    ),
    body="""《本科生奖学金评定办法》

第一条 奖学金种类
本校本科生奖学金分为以下三类：
1. 国家奖学金（每学年评选一次，每人 8000 元）
2. 校级一等奖学金（每学年评选一次，每人 3000 元）
3. 校级二等奖学金（每学年评选一次，每人 1500 元）

第二条 基本申请条件（所有奖学金共同要求）
1. 拥护中国共产党领导，遵守宪法和法律，遵守学校规章制度。
2. 诚实守信，道德品质优良；学年内无任何违纪处分记录。
3. 学年内课程全部及格，无补考、重修记录。
4. 学年内未累计旷课超过 10 学时，未累计未销假超过 3 次。

第三条 国家奖学金评定条件（在基本条件之上）
1. 学年综合测评排名本专业前 10%。
2. 单科成绩不低于 80 分，学年平均绩点不低于 3.5。
3. 有突出的科研、竞赛或社会服务成果之一。
4. 同一学年已获国家励志奖学金的学生，不再获得国家奖学金。

第四条 校级一等奖学金评定条件
1. 学年综合测评排名本专业前 20%。
2. 学年平均绩点不低于 3.3。

第五条 校级二等奖学金评定条件
1. 学年综合测评排名本专业前 40%。
2. 学年平均绩点不低于 3.0。

第六条 综合测评构成
综合测评 = 学业成绩 × 70% + 综合素质 × 30%。综合素质含思想品德（10%）、文体活动（10%）、社会实践（10%）。

第七条 评定流程
1. 每年 9 月 15 日前，学生在系统中提交申请。
2. 9 月 30 日前，辅导员初审。
3. 10 月 15 日前，院系评审委员会评审并公示 5 个工作日。
4. 10 月 31 日前，学工处复核并报学校奖学金领导小组审定。

第八条 取消评选资格的情形
有下列情形之一的，取消当年奖学金评选资格：
1. 学年内受到任何纪律处分。
2. 学业有作弊、抄袭行为被查实。
3. 未按时销假累计超过 3 次。
4. 学术诚信档案有不良记录。

第九条 附则
本办法自 2024 年 9 月 1 日起施行，由学生工作处负责解释。
""",
)


ENROLLMENT_POLICY = KnowledgeDoc(
    doc_id="enrollment_policy_v1",
    title="本科生学籍管理办法",
    keywords=(
        "学籍", "休学", "复学", "退学", "转专业", "转学", "学位",
        "延期", "毕业", "结业", "肄业", "保留学籍",
    ),
    body="""《本科生学籍管理办法》

第一条 学籍建立与注册
新生入学后须按时报到并完成身份核验与注册；无正当理由逾期两周未报到的，视为自动放弃入学资格。每学期开学前两周为注册期，未按时注册且无请假手续的，按旷课处理。

第二条 休学
1. 学生因病、创业、服兵役、家庭特殊困难等原因可申请休学。
2. 因病休学须提供二级以上医院证明；学期中休学以剩余学期为期，最短不少于一学期。
3. 累计休学时间不得超过 2 年；服兵役休学除外。
4. 休学期间保留学籍但不享受在校生权利与待遇。

第三条 复学
1. 休学期满前一个月内，学生须向所在院系提交复学申请。
2. 因病休学者复学须重新提交健康证明。
3. 复学通常编入原专业下一年级，个别情况可编入同年级其他班。

第四条 退学
有下列情形之一的，予以退学处理：
1. 一学期内必修课不及格达 3 门及以上，经补考仍不及格。
2. 休学期满两周内未申请复学。
3. 经学校认可的医院诊断，有精神疾病或其他严重疾病无法继续学习。
4. 本人申请退学，经审批同意。

第五条 转专业
1. 学生在大一、大二年级结束时可申请转专业，每人在校期间仅限一次。
2. 申请条件：无违纪记录、当前专业学习成绩绩点 2.5 以上、目标专业不超过其招生名额 10%。
3. 经目标学院考核通过且原学院同意后，报学校教务处审定。

第六条 学位授予
1. 修满培养方案规定学分、通过毕业论文答辩、符合学校学位授予细则的本科生，授予相应学士学位。
2. 未达到学位要求但完成学业的，颁发毕业证书不授予学位。
3. 因违纪、学术不端被处以留校察看及以上处分的，暂缓或不授予学位。

第七条 毕业与结业
1. 正常修业年限为 4 年；可在 3-6 年内完成学业。
2. 超过最长修业年限仍未完成学业的，按结业处理并颁发结业证书。
3. 结业后 2 年内通过剩余课程的，可换发毕业证书。

第八条 附则
本办法自 2024 年 9 月 1 日起施行，由教务处与学生工作处负责解释。
""",
)


DISCIPLINE_POLICY = KnowledgeDoc(
    doc_id="discipline_policy_v1",
    title="学生违纪处分条例",
    keywords=(
        "处分", "违纪", "纪律", "警告", "记过", "留校察看", "开除",
        "申诉", "撤销处分", "处分档案", "作弊", "抄袭", "学术不端",
    ),
    body="""《学生违纪处分条例》

第一条 处分种类
处分由轻到重依次为：警告、严重警告、记过、留校察看、开除学籍五种。

第二条 典型情形与处分建议
1. 旷课：学期内累计旷课 10-19 学时警告，20-39 学时严重警告，40 学时以上记过。
2. 考试作弊：首次记过以上；使用通讯工具或替考的留校察看；组织作弊的开除学籍。
3. 学术不端（论文抄袭、数据造假）：视情节给予警告至留校察看。
4. 打架斗殴：警告及以上，情节严重移送公安机关。
5. 违反宿舍安全（使用违禁电器导致火情等）：警告以上。
6. 盗窃、故意损坏公物：情节严重者记过及以上并赔偿。

第三条 处分程序
1. 事实调查：由学院学生工作办公室组织调查并形成调查报告，需与学生本人面谈。
2. 听证告知：处分决定前 3 个工作日内书面告知学生拟处分内容、事实和依据，学生可申请听证。
3. 决定与送达：经学校学生处分委员会审议通过后下达书面处分决定。
4. 处分生效：自送达之日起生效。

第四条 申诉
1. 学生对处分决定不服的，可在收到处分决定书 10 个工作日内向学校学生申诉处理委员会提出书面申诉。
2. 申诉委员会应在 15 个工作日内作出复查决定。
3. 申诉期间处分不停止执行。

第五条 处分档案与撤销
1. 除开除学籍外，其他处分均存入学生档案，毕业时归入个人人事档案。
2. 受警告、严重警告、记过处分的学生，在处分生效满 6 个月后表现良好可申请撤销处分（留校察看不适用此条）。
3. 处分撤销后，处分决定书不再装入本人档案，但处分原始记录仍保留在学校存档。

第六条 处分与评奖评优
受处分期间不得参评奖学金、荣誉称号、学生干部；处分撤销后方可恢复资格。

第七条 附则
本条例自 2024 年 9 月 1 日起施行，由学生工作处负责解释。
""",
)


FINANCIAL_AID_POLICY = KnowledgeDoc(
    doc_id="financial_aid_policy_v1",
    title="家庭经济困难学生资助政策",
    keywords=(
        "资助", "助学金", "贫困生", "家庭经济困难", "经济困难", "家里困难",
        "助学贷款", "勤工助学", "励志奖学金", "困难认定",
        "减免学费", "学费减免", "补助", "绿色通道",
    ),
    body="""《家庭经济困难学生资助政策》

第一条 适用对象
本政策适用于家庭经济困难的在校本科生。家庭经济困难认定由学生所在院系依据学校《困难认定办法》组织评议。

第二条 国家助学金
1. 用于资助家庭经济困难学生的生活费，分三档：一档 4400 元/年、二档 3300 元/年、三档 2200 元/年。
2. 每学年申请一次，认定为"特别困难""困难"等级对应一、二档。
3. 不与学费减免叠加使用。

第三条 国家励志奖学金
1. 用于奖励家庭经济困难且品学兼优的二年级以上学生，每人 5000 元/年。
2. 条件：认定为困难档及以上、学年综合测评本专业前 30%、学年无任何违纪处分。
3. 与国家奖学金不得同时获得。

第四条 国家助学贷款
1. 家庭经济困难学生可在入学所在地或学校申请生源地信用助学贷款或校园地助学贷款。
2. 本科阶段最高额度为每年 16000 元，在校期间利息由财政贴息。
3. 还款期限为毕业后 5 年宽限期（只还息）+ 10 年本息分期。

第五条 勤工助学
1. 学校在校内设置勤工助学岗位，优先向家庭经济困难学生开放。
2. 每月工作时间原则上不超过 40 小时，不得影响学习。
3. 报酬按岗位类别核定，不低于当地最低工资标准的小时折算数。

第六条 学费减免
1. 孤儿、烈士子女、建档立卡等特殊群体可申请全额或部分减免学费。
2. 减免由学生本人申请、院系初审、学生资助管理中心审定。

第七条 临时困难补助
因突发事件（家庭重大疾病、自然灾害等）导致生活困难的学生，可随时向院系申请临时困难补助，金额 500-5000 元。

第八条 绿色通道
家庭经济困难新生无法缴纳学费的，可先通过绿色通道办理入学手续，入学后再按程序申请资助。

第九条 附则
本政策与国家、省级最新文件抵触的，以上级文件为准。本政策由学生资助管理中心负责解释。
""",
)


DORMITORY_POLICY = KnowledgeDoc(
    doc_id="dormitory_policy_v1",
    title="学生宿舍管理规定",
    keywords=(
        "宿舍", "住宿", "调换", "调宿", "宿管", "门禁", "熄灯",
        "床位", "公寓", "寝室", "违禁电器", "宿舍卫生",
    ),
    body="""《学生宿舍管理规定》

第一条 入住与调换
1. 学生入学后由学校统一安排宿舍，一般按学院和年级集中住宿。
2. 学生不得擅自调换床位或接纳外人住宿；确需调宿的，须向宿管中心提出申请，经双方舍友同意后办理。
3. 毕业、休学、退学、参军入伍的学生须在规定期限内腾空床位并归还宿舍钥匙/门禁卡。

第二条 门禁与熄灯
1. 宿舍楼门禁 23:00 关闭、次日 6:00 开启；寒暑假另行通知。
2. 寝室熄灯时间为每晚 23:30；熄灯后应保持安静，不得影响他人休息。
3. 超过门禁时间到达的按《学生请假管理办法》第八条"晚归"处理。

第三条 用电与安全
1. 严禁使用电热毯、电热水壶、电饭煲、电吹风（功率 > 500W）、暖手炉等大功率或高温电器。
2. 严禁私拉电线、改装插座、使用劣质电器。
3. 严禁在宿舍内吸烟、焚烧物品、存放易燃易爆物品。违反一经查实记警告及以上处分，造成火情的移送公安机关。

第四条 宿舍卫生
1. 寝室实行值日轮换制，每日打扫并做好垃圾分类。
2. 宿管每周至少检查一次；连续两次不合格的寝室通报所在学院并扣减精神文明评比分。

第五条 访客与夜不归宿
1. 非本寝室人员进入须登记，访问时间不得超过晚间 22:00。
2. 严禁异性进入对方宿舍（开放日除外）。
3. 夜不归宿比照《学生请假管理办法》中的"未归"处理，由辅导员当日通知家长。

第六条 财物管理
1. 学生应妥善保管个人贵重物品，贵重物品建议随身携带或存放在带锁柜中。
2. 发生失窃应立即向宿管和保卫处报案，不得自行处理或传播不实信息。

第七条 附则
违反本规定的处理参照《学生违纪处分条例》。本规定自 2024 年 9 月 1 日起施行，由后勤保障部和学生工作处共同解释。
""",
)


ALL_DOCS: tuple[KnowledgeDoc, ...] = (
    LEAVE_POLICY,
    SCHOLARSHIP_POLICY,
    ENROLLMENT_POLICY,
    DISCIPLINE_POLICY,
    FINANCIAL_AID_POLICY,
    DORMITORY_POLICY,
)


# --------------------------------------------------------------------------- #
# Article splitting (done once at module load)
# --------------------------------------------------------------------------- #

# Matches "第X条 标题" at the start of a line. Captures the heading line.
_ARTICLE_RE = re.compile(r"^(第[一二三四五六七八九十百零〇]+条[^\n]*)$", re.MULTILINE)


def _split_articles(doc: KnowledgeDoc) -> list[Article]:
    """Split a doc body into articles by `第X条` headings."""
    text = doc.body
    matches = list(_ARTICLE_RE.finditer(text))
    if not matches:
        return [Article(
            article_id=f"{doc.doc_id}#art0",
            doc_id=doc.doc_id,
            doc_title=doc.title,
            heading=doc.title,
            body=text.strip(),
        )]
    articles: list[Article] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        articles.append(Article(
            article_id=f"{doc.doc_id}#art{i + 1}",
            doc_id=doc.doc_id,
            doc_title=doc.title,
            heading=m.group(1).strip(),
            body=chunk,
        ))
    return articles


for _doc in ALL_DOCS:
    _doc.articles = _split_articles(_doc)

ALL_ARTICLES: tuple[Article, ...] = tuple(
    art for doc in ALL_DOCS for art in doc.articles
)


# --------------------------------------------------------------------------- #
# Retrieval
# --------------------------------------------------------------------------- #

# Strong imperatives — always treated as commands (bookings / navigation),
# so we skip RAG injection for them.
_STRONG_ACTION_PREFIXES = (
    "帮我", "给我", "替我", "打开", "去", "跳转", "创建", "发起", "提交",
)

# Weak intent modals ("我要 / 我想 ..."). Only counted as a command if one of
# the booking-target verbs also appears in the sentence. This lets "我想休学"
# fall through to RAG while "我想请假" still short-circuits into the flow.
_WEAK_INTENT_PREFIXES = ("我要", "我想")
_BOOKING_VERBS = (
    "请假", "销假", "签到", "投诉", "反映问题", "收集", "打卡",
)


def _looks_like_command(query: str) -> bool:
    q = query.strip()
    if any(q.startswith(p) for p in _STRONG_ACTION_PREFIXES):
        return True
    if any(q.startswith(p) for p in _WEAK_INTENT_PREFIXES):
        return any(v in q for v in _BOOKING_VERBS)
    return False


def _score_article(article: Article, keywords: list[str]) -> float:
    """Score an article by weighted keyword density.

    - Heading hits are worth 3× body hits.
    - Raw weighted count is divided by the body length so that a short,
      on-target article (e.g. `第六条 处分与评奖评优`) ranks above a long,
      tangentially-related one that happens to mention the keyword more times.
    - Returns 0.0 if no keyword appears at all.
    """
    heading = article.heading
    body_ex_heading = article.body[len(heading):]
    raw = 0
    for kw in keywords:
        if not kw:
            continue
        raw += 3 * heading.count(kw)
        raw += body_ex_heading.count(kw)
    if raw == 0:
        return 0.0
    # 40 floor prevents tiny articles from getting absurd density scores.
    return raw * 100.0 / max(40, len(body_ex_heading))


def retrieve(query: str, max_articles: int = 5) -> list[Article]:
    """Article-level retriever.

    Pipeline:
    1. Drop command-style queries so booking flows don't pull in policy text.
    2. For each doc, check which of its keywords appear in the query. If none
       appear, every article of that doc is skipped (doc-level gate).
    3. Pool all hit keywords across surviving docs — lets cross-topic articles
       (e.g. `处分与评奖评优`) score with both `处分` and `奖学金` simultaneously.
    4. Score each surviving article by weighted keyword density.
    5. Return top-K by score.
    """
    if not query or _looks_like_command(query):
        return []

    gated_docs: list[KnowledgeDoc] = []
    pooled_keywords: set[str] = set()
    for doc in ALL_DOCS:
        hits = [kw for kw in doc.keywords if kw in query]
        if not hits:
            continue
        gated_docs.append(doc)
        pooled_keywords.update(hits)

    if not gated_docs:
        return []

    kw_list = list(pooled_keywords)
    scored: list[tuple[float, Article]] = []
    for doc in gated_docs:
        for art in doc.articles:
            s = _score_article(art, kw_list)
            if s > 0:
                scored.append((s, art))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [a for _, a in scored[:max_articles]]


# Retained for any caller that still expects doc-level results.
def retrieve_docs(query: str, max_docs: int = 3) -> list[KnowledgeDoc]:
    """Doc-level compatibility shim: dedupes retrieved articles back to docs."""
    arts = retrieve(query, max_articles=max_docs * 3)
    seen: dict[str, KnowledgeDoc] = {}
    for art in arts:
        if art.doc_id in seen:
            continue
        for doc in ALL_DOCS:
            if doc.doc_id == art.doc_id:
                seen[art.doc_id] = doc
                break
        if len(seen) >= max_docs:
            break
    return list(seen.values())


def format_context(articles: list[Article]) -> str:
    """Format retrieved articles for injection into the system prompt.

    Articles are grouped by their parent doc to keep citations readable.
    """
    if not articles:
        return ""

    by_doc: dict[str, list[Article]] = {}
    order: list[str] = []
    for art in articles:
        if art.doc_id not in by_doc:
            by_doc[art.doc_id] = []
            order.append(art.doc_id)
        by_doc[art.doc_id].append(art)

    parts = ["\n## 制度参考资料\n以下是可引用的校规制度条款，回答校规问题时只能基于这些资料：\n"]
    for doc_id in order:
        group = by_doc[doc_id]
        parts.append(f"\n### 《{group[0].doc_title}》\n")
        for art in group:
            parts.append(f"\n{art.body}\n")
    parts.append(
        "\n**回答要求**：\n"
        "- 回答校规/制度类问题时，只能依据上述条款。\n"
        "- 引用具体条款时，用「《文档标题》第X条」格式。\n"
        "- 资料未覆盖的问题，明确回复「该问题制度中未明确，建议咨询辅导员」，不要编造。\n"
    )
    return "".join(parts)
