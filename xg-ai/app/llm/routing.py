"""Scenario-based model routing (M2).

按"调用场景"返回模型名，配置驱动。所有场景默认值都退回到 `settings.deepseek_model`，
意味着未在 env 配额外路由时，行为与 M1 完全一致（仍然是 DeepSeek 单一模型）。

约定的 scenario:
    - "router":   意图/路由判断，可用小模型
    - "chat":     学生/教师对话主路径
    - "analysis": 复杂分析、报告、insight
    - "embedding": 向量化

STATUS: implemented (M2)
"""
from __future__ import annotations

from typing import Literal

from app.config import settings

Scenario = Literal["router", "chat", "analysis", "embedding"]


def pick_model(scenario: Scenario) -> str:
    """Return the configured model name for `scenario`, with safe defaults."""
    if scenario == "embedding":
        return settings.model_embedding_default or settings.embedding_model
    if scenario == "router":
        return settings.model_router_default or settings.deepseek_model
    if scenario == "analysis":
        return settings.model_analysis_default or settings.deepseek_model
    return settings.model_chat_default or settings.deepseek_model
