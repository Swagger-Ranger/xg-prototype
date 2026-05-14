"""JWT / internal-token validation — *skeleton only* (M3.1).

预期:
- 从 `Authorization: Bearer ...` header 解析，验签并提取 user_id / role / tenant_id。
- 与 Java 端 Sa-Token 兼容：约定相同的 JWT 签名密钥或公钥（M3.1 决定）。
- 现有 Python AI 不强制鉴权（依赖内网 + INTERNAL_TOKEN），M3.1 后改为可选硬开关。

STATUS: skeleton-only, target: M3.1
"""
