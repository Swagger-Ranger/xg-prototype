"""角色配置推荐 — 让小夕根据自然语言指令为「自定义角色」生成 code/name/perms 建议。

流程:
  1) 前端在「新建角色」Modal 里给一句话(如:副院长助理,只能看本院学生 + 看请假统计)
  2) 调本 endpoint /role-config/propose
  3) Endpoint 调 backend 拉 sys_permission 全量字典 + sys_role 现有 code(防重)
  4) LLM 出结构化 JSON:{code, name, description, permission_codes, ai_message}
  5) Endpoint 过滤掉字典里查不到的码,确保返回的 permission_codes 都合法
  6) 前端把 code/name/desc/perms 预填到表单,用户可调整后点「确认创建」

不做 apply — 创建路径就是 backend POST /api/v1/system/roles,前端调即可。
"""
from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from app.api.deps import require_roles
from app.config import settings
from app.llm.deepseek import DeepSeekProvider

router = APIRouter(prefix="/role-config", tags=["role-config"])
logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是学工系统的角色权限设计助手。校管理员描述一种岗位/职责,
你输出一份「自定义角色」配置建议:角色 code、中文名、一句描述,以及该角色应该有的权限码集合。

# 输出 JSON 格式(严格 JSON,不要 markdown 包裹)

{
  "code": "<lowercase_with_underscores>",
  "name": "<中文角色名,≤16 字>",
  "description": "<一句话说明该角色职责,≤80 字>",
  "permission_codes": ["<perm:code1>", "<perm:code2>", ...],
  "ai_message": "<对管理员解释为什么这样选权限,≤120 字,语气友善>"
}

# code 规则

- 4-32 字符,以小写字母开头,只含 a-z / 0-9 / 下划线
- 不能与「现有角色 code 列表」里任一个重名
- 不能是 super_admin / system / admin 这种过宽的名字

# permission_codes 规则

- **必须**全部来自「权限码字典」给出的 code,严禁编造
- 学工系统角色通常只读多于写。要新增 :manage / :approve / :export 类高危权限,
  先在 ai_message 里讲清楚理由,不要默认就给
- system:* 类权限(用户/角色/字典管理)不要给非管理岗角色
- ai:assistant:use 默认给(只要不是机器账户)
- 如果用户描述里说"只读 / 只能看 / 查看",绝不给 :manage / :create / :approve / :submit
- 如果用户描述包含"统计 / 报表 / 看板",给 leave:stats / 类似 :stats / :view

# 反问规则

如果用户说得太笼统(如"加个角色"、"建个新的"),不要硬编。返回:
{"code": "", "name": "", "description": "", "permission_codes": [],
 "ai_message": "请再说说这个角色具体是干嘛的?能看什么?能改什么?属于哪个层级?"}

只输出 JSON,不要任何解释、寒暄、markdown 标记。
"""


class ProposeReq(BaseModel):
    instruction: str


class ProposeResp(BaseModel):
    code: str = ""
    name: str = ""
    description: str = ""
    permission_codes: list[str] = []
    ai_message: str = ""
    error_code: str | None = None


def _strip_md_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.strip("`")
        nl = s.find("\n")
        if nl >= 0:
            s = s[nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


@router.post(
    "/propose",
    response_model=ProposeResp,
    dependencies=[Depends(require_roles("school_admin", "super_admin"))],
)
async def propose(
    req: ProposeReq,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default="default"),
    x_user_role: str = Header(default="school_admin"),
    authorization: str = Header(default=""),
) -> ProposeResp:
    instruction = (req.instruction or "").strip()
    if not instruction:
        return ProposeResp(
            ai_message="请用一句话告诉我这个角色是干嘛的",
            error_code="EMPTY_INSTRUCTION",
        )

    headers = {
        "X-User-Id": x_user_id or "0",
        "X-Tenant-Id": x_tenant_id or "default",
        "X-User-Role": x_user_role or "school_admin",
    }
    if authorization:
        headers["Authorization"] = authorization

    # 1) 拉权限字典 + 现有角色 code 列表
    perms: list[dict] = []
    existing_role_codes: list[str] = []
    try:
        async with httpx.AsyncClient(
            base_url=settings.java_base_url, timeout=8.0, trust_env=False
        ) as c:
            r1 = await c.get("/api/v1/system/permissions", headers=headers)
            r1.raise_for_status()
            perms = r1.json().get("data") or []
            r2 = await c.get("/api/v1/system/roles", headers=headers)
            r2.raise_for_status()
            existing_role_codes = [
                r.get("code") for r in (r2.json().get("data") or []) if r.get("code")
            ]
    except Exception:
        # 详细异常 server-side log,响应只给通用中文提示,避免泄漏内部 URL / 栈
        logger.exception("role_config.propose: backend fetch failed")
        return ProposeResp(
            ai_message="读取权限字典失败,请稍后重试",
            error_code="BACKEND_FETCH_FAILED",
        )

    if not perms:
        return ProposeResp(
            ai_message="权限字典为空,无法推荐",
            error_code="NO_PERMISSIONS",
        )

    valid_codes = {p.get("code") for p in perms if p.get("code")}

    # 2) 组装 prompt(权限字典按 module 分组列出)
    # 大字典截断:每个 module 内超过 20 条只列前 20 条,避免 prompt 撑爆 context window /
    # 烧 token。AI 真要更多权限码时,模型会从已列出的码外推或反问。日志记录截断量。
    PERMS_PER_MODULE_LIMIT = 20
    by_module: dict[str, list[dict]] = {}
    for p in perms:
        mod = p.get("module") or "other"
        by_module.setdefault(mod, []).append(p)

    truncated = 0
    perm_block_lines: list[str] = []
    for mod, items in sorted(by_module.items()):
        perm_block_lines.append(f"\n## {mod}")
        shown = items[:PERMS_PER_MODULE_LIMIT]
        for p in shown:
            perm_block_lines.append(f"  - {p.get('code')} ({p.get('name') or ''})")
        if len(items) > PERMS_PER_MODULE_LIMIT:
            extra = len(items) - PERMS_PER_MODULE_LIMIT
            truncated += extra
            perm_block_lines.append(f"  - ...(本模块还有 {extra} 条未展示)")
    if truncated:
        logger.info("role_config.propose: truncated %d perm entries to keep prompt small", truncated)
    perm_block = "\n".join(perm_block_lines)

    role_block = ", ".join(existing_role_codes) or "(无)"

    user_msg = (
        f"# 现有角色 code(不能重名)\n{role_block}\n\n"
        f"# 权限码字典(分组列出,permission_codes 必须从这里选)\n{perm_block}\n\n"
        f"# 管理员的描述\n{instruction}\n\n"
        f"请按系统提示的 JSON 格式输出。"
    )

    # 3) LLM
    provider = DeepSeekProvider()
    try:
        turn = await provider.chat_native(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=1200,
        )
    except Exception:
        logger.exception("role_config.propose: LLM failed")
        return ProposeResp(
            ai_message="AI 暂不可用,请稍后再试",
            error_code="LLM_FAILED",
        )

    raw = _strip_md_fence(turn.text or "")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning(
            "role_config.propose: LLM JSON parse failed: %s; raw[:200]=%s",
            e, raw[:200],
        )
        return ProposeResp(
            ai_message="AI 输出格式异常,请换种说法再试",
            error_code="LLM_BAD_OUTPUT",
        )

    # 4) 校验与裁剪
    code = (parsed.get("code") or "").strip().lower()
    name = (parsed.get("name") or "").strip()
    description = (parsed.get("description") or "").strip()
    ai_message = (parsed.get("ai_message") or "").strip()
    raw_perms = parsed.get("permission_codes") or []

    # AI 反问时 code/name 都为空 — 直接转交给前端展示 ai_message
    if not code and not name:
        return ProposeResp(
            ai_message=ai_message or "请再说说这个角色具体是干嘛的?",
            error_code="NEEDS_CLARIFICATION",
        )

    # 过滤 perm codes
    accepted: list[str] = []
    dropped: list[str] = []
    seen: set[str] = set()
    for p in raw_perms:
        if not isinstance(p, str):
            continue
        if p in seen:
            continue
        seen.add(p)
        if p in valid_codes:
            accepted.append(p)
        else:
            dropped.append(p)
    if dropped:
        logger.info("role_config.propose: dropped %d unknown perm code(s): %s",
                    len(dropped), dropped[:8])

    # code 重名兜底:让 LLM 输出生效但提醒
    if code in existing_role_codes:
        return ProposeResp(
            code=code, name=name, description=description,
            permission_codes=accepted,
            ai_message=(
                f"我建议叫「{name}」(code={code}),但这个 code 已经被占用了,"
                "请改一下 code 再创建。"
            ),
            error_code="CODE_TAKEN",
        )

    return ProposeResp(
        code=code,
        name=name,
        description=description,
        permission_codes=accepted,
        ai_message=ai_message or "已为你拟好一份配置,请按需要调整后确认。",
        error_code=None,
    )
