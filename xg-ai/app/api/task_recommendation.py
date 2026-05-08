"""Per-task AI recommendation.

The Java backend ships a pre-computed rule-based risk grade (high/medium/low)
plus the applicant's recent stats. This endpoint turns that structured context
into a short natural-language recommendation the counselor can glance at before
approving.

Degrades gracefully: on any LLM failure we return 200 with
{recommendation: "", reason: "", error_message: "..."} so the caller just hides
the AI section rather than aborting the page.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings
from app.llm.deepseek import DeepSeekProvider
from app.rag.knowledge import format_context
from app.rag.retriever import retrieve_semantic

router = APIRouter(tags=["task-recommendation"])
logger = logging.getLogger(__name__)

llm = DeepSeekProvider()


# In-memory LRU cache. Single sidecar replica; cache loss on restart is fine
# (cold cache adds at most one LLM call per task). Keyed by SHA-256 of the
# full TaskContext JSON so any field change (new alert / new violation /
# different reasons) auto-invalidates.
_CACHE_TTL_SECONDS = 30 * 60
_CACHE_MAX_SIZE = 500
_recommendation_cache: dict[str, tuple[float, "RecommendationResponse"]] = {}


def _cache_key(ctx: "TaskContext") -> str:
    payload = ctx.model_dump_json(exclude_none=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> "RecommendationResponse | None":
    entry = _recommendation_cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if time.time() - ts > _CACHE_TTL_SECONDS:
        _recommendation_cache.pop(key, None)
        return None
    return resp


def _cache_put(key: str, resp: "RecommendationResponse") -> None:
    if len(_recommendation_cache) >= _CACHE_MAX_SIZE:
        # Evict the oldest entry (cheap O(n) scan; n ≤ 500).
        oldest_key = min(_recommendation_cache, key=lambda k: _recommendation_cache[k][0])
        _recommendation_cache.pop(oldest_key, None)
    _recommendation_cache[key] = (time.time(), resp)


SYSTEM_PROMPT = (
    "你是高校辅导员的 AI 审批助手。用户（辅导员）正在处理一条待审批工单，"
    "系统已经给出规则引擎判定的 risk_level 与 reasons。请结合整体情况，"
    "给辅导员一句可执行的审批建议。\n\n"
    "原则：\n"
    "- 只基于给定 context 推理，不要编造具体日期 / 金额 / 缺勤课程名等细节。\n"
    "- 推荐动作三选一：approve（建议通过）/ caution（建议谨慎，需要电话或面谈确认）/ reject（建议驳回）。\n"
    "- 语气专业、简洁，不要说教。\n"
    "- 你的判断**必须给规则引擎带来增量信息**，不要只是复述 risk_level。\n"
    "  · 同意规则结论时：可简短说\"无新增风险点\"。\n"
    "  · 不同意规则结论时（例如规则判 high 但你判 approve，或反之），**必须明确说出依据是哪条 context 字段**（具体引用数字或字段名）。\n"
    "- 重点关注以下四类 context（如果存在），任一异常都应该 surface：\n"
    "  1) **时间窗**：leave_start_time / leave_end_time。考虑是否撞考试周（一般 6 月、12 月）、节假日扎堆、跨学期等。\n"
    "  2) **目的地**：leave_form_data.destination。出境 / 跨省 / 高风险地区要特别提醒确认安全。\n"
    "  3) **同类型历史**：similar_leave_count_90d / similar_leave_total_days_90d。同假别近 90 天 ≥4 次 或 累计 ≥15 天 都是黄色信号。\n"
    "  4) **事由质量**：leave_reason 过短（≤4 字）/含\"等\"\"有事\"等敷衍词，建议在 checkpoints 提醒补充。\n"
    "- 如果 reasons 很充分，rationale 需明确引用 reasons 里的数字。\n"
    "- 如果系统下方附带《制度参考资料》，**当本次申请触及具体规则（如累计天数上限、医院证明要求、未销假累计）时，rationale 中可引用条款编号**（例如：\"按《学生请假管理办法》第 X 条…\"）；不要凭空捏造条款。\n\n"
    "输出格式（严格 JSON，不要 Markdown、不要解释）：\n"
    '{"recommendation": "approve" | "caution" | "reject",\n'
    ' "headline": "≤18 字一句话结论",\n'
    ' "rationale": "≤80 字详细说明，用\\\\n 分段，最多 3 段",\n'
    ' "checkpoints": ["审批前需要核实的点1", "点2"]}  // checkpoints 最多 3 条，可以为空数组\n'
)


class TaskContext(BaseModel):
    biz_type: str
    risk_level: Literal["high", "medium", "low"]
    reasons: list[str] = Field(default_factory=list)
    initiator_name: str = ""

    # Leave-specific (optional)
    leave_type_name: str | None = None
    leave_duration_days: float | None = None
    leave_reason: str | None = None
    leave_start_time: str | None = None  # ISO date YYYY-MM-DD
    leave_end_time: str | None = None
    leave_form_data: dict | None = None  # destination / emergency_contact / ...
    similar_leave_count_90d: int | None = None
    similar_leave_total_days_90d: float | None = None

    # Applicant stats (from PendingTaskEnricher)
    absent_30d: int = 0
    leave_count_30d: int = 0
    open_alerts_critical: int = 0
    open_alerts_high: int = 0
    open_alerts_medium: int = 0
    open_alerts_low: int = 0
    unpunished_violations: int = 0
    violation_90d: int = 0


class RecommendationResponse(BaseModel):
    model: str
    recommendation: Literal["approve", "caution", "reject", ""] = ""
    headline: str = ""
    rationale: str = ""
    checkpoints: list[str] = Field(default_factory=list)
    error_message: str | None = None


@router.post("/task-recommendation", response_model=RecommendationResponse)
async def task_recommendation(ctx: TaskContext) -> RecommendationResponse:
    cache_key = _cache_key(ctx)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.debug("task_recommendation cache hit key=%s", cache_key[:12])
        return cached

    user = (
        f"工单类型：{ctx.biz_type}\n"
        f"申请人：{ctx.initiator_name or '未知'}\n"
        f"规则判定风险：{ctx.risk_level}\n"
        f"规则触发原因：{'；'.join(ctx.reasons) or '无'}\n"
    )
    if ctx.biz_type == "leave":
        user += (
            f"请假类型：{ctx.leave_type_name or '未填写'}\n"
            f"本次时长：{ctx.leave_duration_days or 0} 天\n"
            f"请假事由：{ctx.leave_reason or '未填写'}\n"
        )
        if ctx.leave_start_time or ctx.leave_end_time:
            user += f"请假时间：{ctx.leave_start_time or '?'} → {ctx.leave_end_time or '?'}\n"
        if ctx.leave_form_data:
            # Show known sensitive fields explicitly; dump rest as JSON tail.
            destination = ctx.leave_form_data.get("destination")
            emerg_contact = ctx.leave_form_data.get("emergency_contact")
            transportation = ctx.leave_form_data.get("transportation")
            if destination:
                user += f"目的地：{destination}\n"
            if emerg_contact:
                user += f"紧急联系人：{emerg_contact}\n"
            if transportation:
                user += f"出行方式：{transportation}\n"
        if ctx.similar_leave_count_90d is not None:
            user += (
                f"同假别近90天历史：{ctx.similar_leave_count_90d} 次，"
                f"累计 {ctx.similar_leave_total_days_90d or 0} 天。\n"
            )
    user += (
        f"学生最近历史：近30天旷课 {ctx.absent_30d} 次 / 请假 {ctx.leave_count_30d} 次；"
        f"开放预警 critical={ctx.open_alerts_critical} high={ctx.open_alerts_high} "
        f"medium={ctx.open_alerts_medium} low={ctx.open_alerts_low}；"
        f"未处理违纪 {ctx.unpunished_violations} 条，近90天违纪 {ctx.violation_90d} 条。"
    )

    # Retrieve a few policy snippets the LLM can cite. Build a query from the
    # natural-language reason + leave type so the embedding picks up the right
    # 校规 (e.g. 病假 → 病假相关条款；累计 → 假期上限条款). Failures degrade
    # silently — we just send no context.
    rag_query_parts: list[str] = []
    if ctx.biz_type == "leave":
        if ctx.leave_type_name:
            rag_query_parts.append(ctx.leave_type_name)
        if ctx.leave_reason:
            rag_query_parts.append(ctx.leave_reason)
        if ctx.leave_duration_days and ctx.leave_duration_days >= 7:
            rag_query_parts.append("长期请假 累计天数上限")
    rag_query = " ".join(rag_query_parts).strip()
    rag_block = ""
    if rag_query:
        try:
            articles = await retrieve_semantic(rag_query, k=3)
            if articles:
                rag_block = format_context(articles)
        except Exception:
            logger.exception("RAG retrieve failed for task recommendation; continuing without")

    full_system = SYSTEM_PROMPT + rag_block

    try:
        turn = await llm.chat_native(
            messages=[
                {"role": "system", "content": full_system},
                {"role": "user", "content": user},
            ],
            tools=None,
            temperature=0.2,
            max_tokens=500,
        )
    except Exception as e:
        logger.exception("task recommendation llm failed")
        return RecommendationResponse(model=settings.deepseek_model, error_message=f"llm error: {e}")

    parsed, err = _parse(turn.text)
    if err:
        # Don't cache error responses — let the next call retry.
        return RecommendationResponse(model=settings.deepseek_model, error_message=err)
    resp = RecommendationResponse(model=settings.deepseek_model, **parsed)
    _cache_put(cache_key, resp)
    return resp


def _parse(raw: str) -> tuple[dict[str, Any], str | None]:
    text = (raw or "").strip()
    if not text:
        return {}, "empty llm output"
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        obj = re.search(r"\{.*\}", text, re.DOTALL)
        if not obj:
            return {}, "no json found"
        try:
            data = json.loads(obj.group(0))
        except json.JSONDecodeError as e:
            return {}, f"json parse failed: {e}"
    if not isinstance(data, dict):
        return {}, "unexpected json shape"
    rec = data.get("recommendation")
    if rec not in ("approve", "caution", "reject"):
        rec = "caution"
    out = {
        "recommendation": rec,
        "headline": str(data.get("headline", ""))[:40],
        "rationale": str(data.get("rationale", ""))[:300],
        "checkpoints": [str(c)[:60] for c in (data.get("checkpoints") or [])[:3]],
    }
    return out, None
