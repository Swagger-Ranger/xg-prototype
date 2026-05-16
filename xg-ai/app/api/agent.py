"""Generic LangGraph agent dispatcher.

Request shape: { agent, context, params, trace_id }
Response shape: { agent, output, error_message }

Agents register by name below. Failures never raise — we always return 200 with
error_message populated so the Java-side caller can degrade gracefully.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.alert_rule_author import run as run_alert_rule_author
from app.agent.care_brief import run as run_care_brief
from app.agent.workflow_author import run as run_workflow_author

router = APIRouter(tags=["agent"])
logger = logging.getLogger(__name__)


class AgentInvokeRequest(BaseModel):
    agent: str
    context: dict[str, Any] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None


class AgentInvokeResponse(BaseModel):
    agent: str
    output: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None


AgentFn = Callable[[dict[str, Any], dict[str, Any]], Awaitable[dict[str, Any]]]


async def _alert_rule_author(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    nl = context.get("nl") or params.get("nl") or ""
    return await run_alert_rule_author(nl)


async def _workflow_author(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    current_dsl = context.get("current_dsl") or params.get("current_dsl") or {}
    instruction = context.get("instruction") or params.get("instruction") or ""
    available_roles = context.get("available_roles") or params.get("available_roles") or []
    return await run_workflow_author(current_dsl, instruction, available_roles)


async def _care_brief(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    # 输入安全（§11.2）由 Java 侧按构造保证，这里只信任传入 context
    return await run_care_brief(context)


AGENTS: dict[str, AgentFn] = {
    "alert_rule_author": _alert_rule_author,
    "care_brief": _care_brief,
    "workflow_author": _workflow_author,
}


@router.post("/agent/invoke", response_model=AgentInvokeResponse)
async def invoke(req: AgentInvokeRequest) -> AgentInvokeResponse:
    fn = AGENTS.get(req.agent)
    if fn is None:
        return AgentInvokeResponse(
            agent=req.agent,
            error_message=f"unknown agent: {req.agent}",
        )
    try:
        output = await fn(req.context, req.params)
    except Exception as e:
        logger.exception("agent %s failed trace_id=%s", req.agent, req.trace_id)
        return AgentInvokeResponse(agent=req.agent, error_message=f"agent error: {e}")

    err = output.pop("error_message", None) if isinstance(output, dict) else None
    return AgentInvokeResponse(agent=req.agent, output=output or {}, error_message=err)
