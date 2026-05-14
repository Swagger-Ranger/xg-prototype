"""Scenario-based model routing — *skeleton only* (M2).

预期:
- `pick_model(scenario: Literal["router","chat","analysis","embedding"]) -> str`
- 配置驱动：默认 router 用小模型（如 qwen-turbo / deepseek-chat），analysis 用大模型，embedding 用 bge。
- 与 One-API 渠道映射对齐：返回的 model 名 = One-API "模型名"列。

STATUS: skeleton-only, target: M2
"""
