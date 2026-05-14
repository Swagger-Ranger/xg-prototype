"""Core infrastructure: config / db / redis — *skeleton only*.

与已有 `app/config.py` 共存:
- M1: `app/config.py` 保持原样，是唯一 settings 入口。
- M2+: `app/core/config.py` 接管 settings；`app/config.py` 改为 `from app.core.config import settings` 转发。
- M3 末: 评估是否删 `app/config.py`。

STATUS: skeleton-only, target: M2
"""
