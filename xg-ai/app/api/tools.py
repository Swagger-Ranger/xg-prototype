"""Direct tool-execution endpoint, bypassing the chat LLM router.

Used by clients (mini-app, web admin pages) that know exactly which query tool
they want to call — for example "AI 帮我写申请理由" buttons that should always
invoke `draft_workstudy_application_intro` and never depend on LLM routing.

Reuses `query_tools.execute()` so role-gating and error formatting stay
identical to the chat path.
"""
from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.tool import query_tools

router = APIRouter(tags=["tools"])


class ToolExecRequest(BaseModel):
    args: dict | None = None


class ToolExecResponse(BaseModel):
    output: str
    tool: str


@router.post("/tools/{tool_name}/execute", response_model=ToolExecResponse)
async def execute_tool(
    tool_name: str,
    body: ToolExecRequest,
    x_user_id: str = Header(default=""),
    x_tenant_id: str = Header(default=""),
    x_user_role: str = Header(default="student"),
    x_user_lang: str = Header(default="zh"),
    authorization: str = Header(default=""),
) -> ToolExecResponse:
    if tool_name not in query_tools.HANDLERS:
        raise HTTPException(status_code=404, detail=f"unknown tool: {tool_name}")
    output = await query_tools.execute(
        tool_name=tool_name,
        args=body.args or {},
        user_id=x_user_id,
        tenant_id=x_tenant_id,
        user_role=x_user_role,
        user_lang=x_user_lang,
        authorization=authorization,
    )
    return ToolExecResponse(output=output, tool=tool_name)
