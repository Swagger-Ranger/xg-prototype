"""AI 观察员 NL→SQL 提案 endpoint。

院长 / 学工部部长在 workspace「新建观察员卡」时输入一段中文描述,前端调
POST /ai-observer/propose:

  1) 拉 backend /internal/schema-catalog/markdown?role=<owner_role> 拿白名单表 + 列 + scope hint
  2) LLM 出 JSON: {sql_template, params, chart_suggestions[≤3], title_suggestion}
  3) 校验输出:必须是 SELECT、列出现在 schema markdown 里、chart_type 在枚举内
  4) 返回前端 → 前端调 backend /api/v1/ai-observer/preview 跑 sample → 老师挑 chart → 保存

SQL 安全:LLM 出的 SQL 只是个**草稿**,后端 QueryGuard 还会做完整 AST 校验 + 角色 scope 注入
+ EXPLAIN cost 闸门 + 列敏感性检查。这里只做"能解析 JSON + 字段齐全"的弱校验,真闸门在后端。
"""
from __future__ import annotations

import json
import logging
import re

import httpx
from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.config import settings
from app.llm.deepseek import DeepSeekProvider

router = APIRouter(prefix="/ai-observer", tags=["ai-observer"])
logger = logging.getLogger(__name__)


VALID_CHART_TYPES = {"statistic", "bar", "line", "pie", "table", "trend"}


SYSTEM_PROMPT = """你是数据可视化助手。把校管理员 / 院长 / 学工部部长说的中文描述翻译成
**安全的 SELECT SQL + 3 种推荐图表类型 + 一个建议标题**。

# 工作流
1. 读下方「可查询的表」列表(老师只能看到列出来的表 / 列;敏感列已隐去)。
2. 想清楚要算什么聚合(常见:count / sum / avg / 通过率 / 按月分组 / top N)。
3. 输出**严格 JSON**(无 markdown 包裹),包含:
   - sql:完整 SELECT 语句(单语句、无分号)
   - chart_suggestions:数组,3 个元素,每个 {type, reason, x?, y?, series?}
     - type 只能是:statistic(单数字)/ bar(柱)/ line(折线)/ pie(饼)/ table(表格)/ trend(迷你趋势)
     - reason:为什么这种图合适(≤20 字中文)
   - title_suggestion:8-16 字中文卡片标题

# SQL 硬性约束(违反就是错)
- 必须是单条 SELECT,不要 INSERT/UPDATE/DELETE/DROP
- 不要 SELECT * 或 t.* —— 必须明确列出列名
- 不要带 schema 前缀("public.foo" / "tenant_xx.bar" 都不行),系统靠 search_path 隔离租户
- 不要查 pg_* / information_schema
- 只用「可查询的表」里出现过的表 + 列(列名拼错 = 系统 reject)
- **不要写角色 scope filter**(如 sp.college = '...')—— 那是系统自动追加的,你不要 hardcode

# 聚合规则
- 时间分组优先 `date_trunc('month', col)` 而不是 substring
- 通过率类:`COUNT(*) FILTER (WHERE status='approved')::float / NULLIF(COUNT(*),0) AS pass_rate`
- top N:加 ORDER BY ... DESC LIMIT 5 / 10
- 大表 GROUP BY 时尽量带 WHERE 时间窗 限制扫描行数

# 图表选择启发
- 单聚合数值(总数 / 比率)→ statistic
- 时间趋势 → line(x=时间, y=指标)
- 跨维度对比(各班 / 各学院)→ bar
- 占比(2-5 类)→ pie
- 数据明细 → table
- ≤30 行的迷你趋势 → trend(workspace 卡内联折线)

# 输出 JSON 示例
{
  "sql": "SELECT date_trunc('month', lr.start_time)::date AS month, COUNT(*) AS total, COUNT(*) FILTER (WHERE lr.status='approved')::float / NULLIF(COUNT(*),0) AS pass_rate FROM leave_request lr WHERE lr.start_time > now() - interval '6 months' GROUP BY 1 ORDER BY 1",
  "chart_suggestions": [
    {"type":"line", "reason":"时间趋势看走势最直观", "x":"month", "y":"pass_rate"},
    {"type":"bar",  "reason":"按月对比横向", "x":"month", "y":"total"},
    {"type":"table","reason":"数据精细查阅"}
  ],
  "title_suggestion": "近半年请假通过率走势"
}

# 你看不懂老师意思 / 表里没有合适字段时
返回 {"error": "<≤30 字中文,告诉老师哪里说不清楚>"} 而不是瞎编 SQL。
"""


class ProposeReq(BaseModel):
    nl_query: str = Field(..., min_length=2, max_length=500)
    owner_role: str = Field(default="school_admin")


class ChartSuggestion(BaseModel):
    type: str
    reason: str
    x: str | None = None
    y: str | None = None
    series: str | None = None


class ProposeResp(BaseModel):
    ok: bool
    sql: str | None = None
    chart_suggestions: list[ChartSuggestion] | None = None
    title_suggestion: str | None = None
    ai_message: str
    error_code: str | None = None


@router.post("/propose", response_model=ProposeResp)
async def propose(
    req: ProposeReq,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default="default"),
    x_user_role: str = Header(default=""),
    authorization: str = Header(default=""),
) -> ProposeResp:
    # owner_role 优先用 body 显式传的,header 兜底
    role = (req.owner_role or x_user_role or "school_admin").strip()

    # 1) 拉 schema markdown
    headers = {
        "X-User-Id": x_user_id or "0",
        "X-Tenant-Id": x_tenant_id or "default",
        "X-User-Role": role,
    }
    if authorization:
        headers["Authorization"] = authorization

    try:
        async with httpx.AsyncClient(base_url=settings.java_base_url, timeout=10.0, trust_env=False) as c:
            r = await c.get(f"/internal/schema-catalog/markdown", params={"role": role}, headers=headers)
            r.raise_for_status()
            payload = r.json()
            schema_md = (payload.get("data") or {}).get("markdown") or ""
    except Exception as e:
        logger.exception("ai-observer propose: read schema-catalog failed")
        return ProposeResp(ok=False, ai_message=f"读取 schema 失败:{e}", error_code="READ_FAILED")

    if not schema_md:
        return ProposeResp(ok=False, ai_message="schema-catalog 为空,请联系管理员", error_code="EMPTY_SCHEMA")

    # 2) LLM
    user_msg = f"{schema_md}\n\n# 老师的描述(role={role})\n{req.nl_query}"
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
    except Exception as e:
        logger.exception("ai-observer propose: LLM failed")
        return ProposeResp(ok=False, ai_message=f"AI 服务异常:{e}", error_code="LLM_FAILED")

    raw = (turn.text or "").strip()
    # 容错 ```json 包裹
    if raw.startswith("```"):
        raw = raw.strip("`")
        nl = raw.find("\n")
        if nl >= 0:
            raw = raw[nl + 1:]
        if raw.endswith("```"):
            raw = raw[:-3]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("ai-observer propose: LLM JSON parse failed: %s, raw[:300]=%s", e, raw[:300])
        return ProposeResp(ok=False, ai_message="AI 输出格式异常,请换种说法再试",
                            error_code="LLM_BAD_OUTPUT")

    # LLM 自己说不会做
    if data.get("error"):
        return ProposeResp(ok=False, ai_message=data["error"], error_code="LLM_CANT_DO")

    # 3) 弱校验
    sql = (data.get("sql") or "").strip()
    if not sql or not _looks_like_select(sql):
        return ProposeResp(ok=False, ai_message="AI 没给出合法的 SELECT", error_code="NOT_A_SELECT")

    chart_raw = data.get("chart_suggestions") or []
    if not isinstance(chart_raw, list) or not chart_raw:
        return ProposeResp(ok=False, ai_message="AI 没给图表建议", error_code="NO_CHART_SUGGESTION")

    chart_suggestions: list[ChartSuggestion] = []
    for c in chart_raw[:3]:
        if not isinstance(c, dict):
            continue
        t = (c.get("type") or "").lower()
        if t not in VALID_CHART_TYPES:
            continue
        chart_suggestions.append(ChartSuggestion(
            type=t,
            reason=c.get("reason") or "",
            x=c.get("x"),
            y=c.get("y"),
            series=c.get("series"),
        ))
    if not chart_suggestions:
        return ProposeResp(ok=False, ai_message="AI 出的图表类型无效", error_code="NO_CHART_SUGGESTION")

    title = (data.get("title_suggestion") or "").strip()[:80]

    return ProposeResp(
        ok=True,
        sql=sql,
        chart_suggestions=chart_suggestions,
        title_suggestion=title,
        ai_message="已生成草稿,点「试跑」看 sample,再挑可视化保存。",
    )


_SELECT_RE = re.compile(r"^\s*(?:WITH\s+.+\)\s*)?SELECT\b", re.IGNORECASE | re.DOTALL)


def _looks_like_select(sql: str) -> bool:
    """快速判断 — 后端 QueryGuard 还有完整 JSqlParser 校验,这里只是早 fail。"""
    if ";" in sql.rstrip(";"):
        return False  # 多语句
    return bool(_SELECT_RE.match(sql))
