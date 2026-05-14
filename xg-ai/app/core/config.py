"""Centralized settings (Pydantic Settings) — *skeleton only*.

预期（M2）:
- 接管 `app/config.py` 现有所有字段，并新增:
  - openai_api_base_url（One-API 统一入口）
  - langfuse_host / langfuse_public_key / langfuse_secret_key
  - mcp_server_url / mcp_transport
  - input_filter_hard / output_filter_hard
- 老 `app/config.py` 改为 `from app.core.config import settings` 透传。

STATUS: skeleton-only, target: M2
"""
