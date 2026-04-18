"""RAG retrieval evaluation.

A small labeled test set lets us compare retrievers quantitatively.
Each case: one natural-language query paired with the set of article_ids
that a correct retriever must surface. Gold is authored from the content
of `app/rag/knowledge.py`, not from what the current retriever happens
to return.

Metrics (all at cut-off K):
  - Precision@K = |retrieved ∩ gold| / K
  - Recall@K    = |retrieved ∩ gold| / |gold|
  - Hit@K       = 1 if any gold in top-K else 0
  - MRR         = mean of 1/rank_of_first_gold, 0 if miss

Run:  .venv/bin/python -m eval.rag_eval
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Callable, Sequence

from app.rag.knowledge import retrieve as keyword_retrieve, Article


@dataclass
class Case:
    query: str
    gold: set[str]
    note: str = ""


# ----- Labeled test set ---------------------------------------------------- #
# Gold is authored from the policy bodies in app/rag/knowledge.py.
# Keep each query realistic (how a student would actually phrase it).

TEST_SET: list[Case] = [
    # --- Scholarship -------------------------------------------------------
    Case("二等奖学金一年多少钱？", {"scholarship_policy_v1#art1"}, "金额在第一条"),
    Case("国家奖学金对绩点有什么要求？", {"scholarship_policy_v1#art3"}, "国奖绩点≥3.5"),
    Case("综合测评怎么算的？", {"scholarship_policy_v1#art6"}),
    Case("奖学金什么时候开始申请？", {"scholarship_policy_v1#art7"}, "评定流程/时间"),
    Case("哪些情况会被取消奖学金评选资格？", {"scholarship_policy_v1#art8"}),

    # --- Leave -------------------------------------------------------------
    Case("请假 7 天要谁批？", {"leave_policy_v1#art2"}, "审批权限"),
    Case("病假一定要医院证明吗？", {"leave_policy_v1#art3"}),
    Case("晚归几次会警告？", {"leave_policy_v1#art8"}),
    Case("多久之内必须销假？", {"leave_policy_v1#art7"}),
    Case("事假最长能请几天？", {"leave_policy_v1#art4"}),

    # --- Enrollment --------------------------------------------------------
    Case("我想休学半年，怎么办手续？", {"enrollment_policy_v1#art2"}),
    Case("休学最多可以休几年？", {"enrollment_policy_v1#art2"}),
    Case("怎么申请复学？", {"enrollment_policy_v1#art3"}),
    Case("大几可以转专业，需要什么条件？", {"enrollment_policy_v1#art5"}),
    Case("本科最多读几年？", {"enrollment_policy_v1#art7"}),
    Case("挂科几门会被退学？", {"enrollment_policy_v1#art4"}),

    # --- Discipline --------------------------------------------------------
    Case("考试作弊会怎么处理？", {"discipline_policy_v1#art2"}),
    Case("处分一共有几种？", {"discipline_policy_v1#art1"}),
    Case("对处分结果不服，能申诉吗？", {"discipline_policy_v1#art4"}),
    Case("被警告处分了，当年还能评奖学金吗？", {"discipline_policy_v1#art6"}),
    Case("处分以后还能撤销吗？", {"discipline_policy_v1#art5"}),

    # --- Financial aid -----------------------------------------------------
    Case("家里经济条件不好，学校有什么资助？",
         {"financial_aid_policy_v1#art2",
          "financial_aid_policy_v1#art4",
          "financial_aid_policy_v1#art5"}),
    Case("助学贷款最高能贷多少？毕业后怎么还？",
         {"financial_aid_policy_v1#art4"}),
    Case("勤工助学一个月最多能做多少小时？",
         {"financial_aid_policy_v1#art5"}),
    Case("国家励志奖学金的申请条件？",
         {"financial_aid_policy_v1#art3"}),
    Case("突发家里出事，能临时申请补助吗？",
         {"financial_aid_policy_v1#art7"}),

    # --- Dormitory ---------------------------------------------------------
    Case("宿舍几点关门、几点熄灯？", {"dormitory_policy_v1#art2"}),
    Case("宿舍能不能用电热毯？", {"dormitory_policy_v1#art3"}),
    Case("想换宿舍怎么办？", {"dormitory_policy_v1#art1"}),
    Case("晚上几点以后不让访客进？", {"dormitory_policy_v1#art5"}),
]


# ----- Scoring ------------------------------------------------------------- #

Retriever = Callable[[str, int], Sequence[Article]]


def _rank_of_first_gold(articles: Sequence[Article], gold: set[str]) -> int | None:
    for i, a in enumerate(articles, start=1):
        if a.article_id in gold:
            return i
    return None


def evaluate(name: str, retriever: Retriever, K: int = 5) -> dict:
    precisions_k: dict[int, list[float]] = {1: [], 3: [], 5: []}
    recalls_k: dict[int, list[float]] = {1: [], 3: [], 5: []}
    hits_k: dict[int, list[int]] = {1: [], 3: [], 5: []}
    rrs: list[float] = []

    per_case: list[dict] = []

    for case in TEST_SET:
        results = list(retriever(case.query, K))
        result_ids = [a.article_id for a in results]
        rank = _rank_of_first_gold(results, case.gold)
        rr = 1.0 / rank if rank else 0.0
        rrs.append(rr)

        for k in (1, 3, 5):
            top_k_ids = set(result_ids[:k])
            inter = top_k_ids & case.gold
            precisions_k[k].append(len(inter) / k)
            recalls_k[k].append(len(inter) / len(case.gold))
            hits_k[k].append(1 if inter else 0)

        per_case.append({
            "query": case.query,
            "gold": sorted(case.gold),
            "retrieved": result_ids,
            "first_gold_rank": rank,
        })

    summary = {
        "retriever": name,
        "n": len(TEST_SET),
        "MRR": mean(rrs),
        "hit@1": mean(hits_k[1]),
        "hit@3": mean(hits_k[3]),
        "hit@5": mean(hits_k[5]),
        "P@1": mean(precisions_k[1]),
        "P@3": mean(precisions_k[3]),
        "P@5": mean(precisions_k[5]),
        "R@3": mean(recalls_k[3]),
        "R@5": mean(recalls_k[5]),
    }
    return {"summary": summary, "per_case": per_case}


def _print_summary(results: list[dict]) -> None:
    rows = [r["summary"] for r in results]
    cols = ["retriever", "n", "hit@1", "hit@3", "hit@5", "MRR",
            "P@1", "P@3", "P@5", "R@3", "R@5"]
    widths = {c: max(len(c), *(len(f"{r[c]:.3f}" if isinstance(r[c], float) else str(r[c]))
                               for r in rows)) for c in cols}

    header = "  ".join(c.ljust(widths[c]) for c in cols)
    print(header)
    print("-" * len(header))
    for r in rows:
        line = "  ".join(
            (f"{r[c]:.3f}" if isinstance(r[c], float) else str(r[c])).ljust(widths[c])
            for c in cols
        )
        print(line)


def _print_misses(result: dict, limit: int = 10) -> None:
    name = result["summary"]["retriever"]
    misses = [c for c in result["per_case"] if c["first_gold_rank"] is None]
    downranks = [c for c in result["per_case"]
                 if c["first_gold_rank"] and c["first_gold_rank"] > 1]
    print(f"\n[{name}] misses (no gold in top-5): {len(misses)}")
    for c in misses[:limit]:
        print(f"  Q: {c['query']}")
        print(f"    gold    : {c['gold']}")
        print(f"    retrieved: {c['retrieved']}")
    print(f"[{name}] down-ranks (gold at rank>1): {len(downranks)}")
    for c in downranks[:limit]:
        print(f"  Q: {c['query']}  (first gold at rank {c['first_gold_rank']})")
        print(f"    retrieved: {c['retrieved']}")


def _pgvector_retrieve_factory() -> Retriever:
    """Sync wrapper around async `retrieve_semantic`. Uses a single event
    loop across all calls so the asyncpg pool survives; `asyncio.run` would
    tear down the loop after each call and invalidate the module-level pool.
    Threshold is disabled (max_distance=1.0) so the comparison is top-K."""
    import asyncio
    from app.rag.retriever import retrieve_semantic as async_sem

    loop = asyncio.new_event_loop()

    def _sync_retrieve(query: str, k: int = 5):
        return loop.run_until_complete(async_sem(query, k=k, max_distance=1.0))

    return _sync_retrieve


def main() -> None:
    results = [evaluate("keyword", keyword_retrieve)]
    try:
        from eval.rag_semantic import retrieve as semantic_retrieve
        results.append(evaluate("semantic", semantic_retrieve))
    except ModuleNotFoundError as e:
        print(f"[skip semantic] {e}")
    try:
        results.append(evaluate("pgvector", _pgvector_retrieve_factory()))
    except Exception as e:
        print(f"[skip pgvector] {e}")
    _print_summary(results)
    for r in results:
        _print_misses(r)


if __name__ == "__main__":
    main()
