"""structlog configuration — *skeleton only* (M3.1).

预期:
- 配置 structlog: JSON 输出 + trace_id / user_id / tenant_id 自动注入。
- 与现有 `logging` 共存：现有 `logger = logging.getLogger(__name__)` 不变，
  本模块提供 `get_struct_logger(name)` 给新代码用。

STATUS: skeleton-only, target: M3.1
"""
