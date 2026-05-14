"""Unified OpenAI-compatible LLM client (entry point for One-API) — *skeleton only*.

预期（M2 实现）:
- 单例 `AsyncOpenAI(base_url=settings.openai_api_base_url or 厂商默认)`，封装 chat / embed / stream。
- 默认指向 One-API（`http://one-api:3000/v1`）；One-API 不可达时由 `fallback.py` 回落。
- 把现有 `qwen.py` / `deepseek.py` 改造成"transparent shim → 转发到本文件"，
  外部调用方零改动（保留 `from app.llm.deepseek import DeepSeekProvider` 等老 import）。

迁移路径（M2）:
    业务代码：from app.llm.deepseek import DeepSeekProvider   # 不变
    deepseek.py 内部：DeepSeekProvider = make_shim_for("deepseek/deepseek-v3.2")
    底层：全部走 openai_client.chat()
此后切换厂商只需要改 One-API 渠道配置 + settings.openai_api_base_url，不需要碰业务代码。

依赖（已在 pyproject.toml）:
- openai>=1.30.0

STATUS: skeleton-only, target: M2
"""
