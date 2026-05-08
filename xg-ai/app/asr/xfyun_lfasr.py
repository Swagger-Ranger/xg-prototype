"""讯飞 lfasr v2 录音文件转写客户端。

签名: signa = base64(HmacSHA1(MD5(appId + ts), secretKey))
上传: POST https://raasr.xfyun.cn/v2/api/upload   body=binary, query=metadata
查询: POST https://raasr.xfyun.cn/v2/api/getResult query=orderId+auth
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

UPLOAD_URL = "https://raasr.xfyun.cn/v2/api/upload"
RESULT_URL = "https://raasr.xfyun.cn/v2/api/getResult"


class XfyunAsrError(RuntimeError):
    pass


def _sign(app_id: str, secret_key: str, ts: str) -> str:
    md5_hex = hashlib.md5((app_id + ts).encode()).hexdigest()
    sig = hmac.new(secret_key.encode(), md5_hex.encode(), hashlib.sha1).digest()
    return base64.b64encode(sig).decode()


def _auth_params() -> dict[str, str]:
    if not settings.xfyun_app_id or not settings.xfyun_api_secret:
        raise XfyunAsrError("讯飞凭据未配置 (XFYUN_APP_ID / XFYUN_API_SECRET)")
    ts = str(int(time.time()))
    return {
        "appId": settings.xfyun_app_id,
        "ts": ts,
        "signa": _sign(settings.xfyun_app_id, settings.xfyun_api_secret, ts),
    }


async def upload(
    audio: bytes,
    file_name: str,
    duration_ms: int | None = None,
    role_separation: bool = False,
    role_num: int = 0,
    hot_words: str | None = None,
) -> str:
    """上传音频文件，返回 orderId。"""
    params: dict[str, str] = _auth_params() | {
        "fileName": file_name,
        "fileSize": str(len(audio)),
        # 讯飞要求 duration（ms）。客户端可不传，回退用文件字节数——
        # 对任何正常采样率的音频都 >= 真实时长，讯飞按实际识别时长计费。
        "duration": str(duration_ms if duration_ms and duration_ms > 0 else len(audio)),
    }
    if role_separation:
        params["roleType"] = "1"
        if role_num > 0:
            params["roleNum"] = str(role_num)
    if hot_words:
        params["hotWord"] = hot_words

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            UPLOAD_URL,
            params=params,
            content=audio,
            headers={"Content-Type": "application/octet-stream"},
        )
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "000000":
        raise XfyunAsrError(
            f"讯飞上传失败 code={data.get('code')} desc={data.get('descInfo')}"
        )
    return data["content"]["orderId"]


async def get_result(order_id: str) -> dict[str, Any]:
    """查询转写状态/结果，返回原始 content 字典。"""
    params = _auth_params() | {"orderId": order_id, "resultType": "transfer"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(RESULT_URL, params=params)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "000000":
        raise XfyunAsrError(
            f"讯飞查询失败 code={data.get('code')} desc={data.get('descInfo')}"
        )
    return data["content"]


def parse_transcript(content: dict[str, Any]) -> dict[str, Any]:
    """解析 orderResult。

    返回 {status, text, segments}：
      status: processing | complete | failed
      segments: [{speaker, start_ms, end_ms, text}]（启用 roleType 时 speaker 才有意义）
    """
    fail_type = content.get("failType")
    if fail_type:
        return {"status": "failed", "text": "", "segments": [], "message": str(fail_type)}

    raw = content.get("orderResult")
    if not raw:
        return {"status": "processing", "text": "", "segments": []}

    parsed = json.loads(raw) if isinstance(raw, str) else raw
    lattice = parsed.get("lattice") or parsed.get("lattice2") or []

    segments: list[dict[str, Any]] = []
    text_parts: list[str] = []

    for item in lattice:
        best_raw = item.get("json_1best")
        if not best_raw:
            continue
        best = json.loads(best_raw) if isinstance(best_raw, str) else best_raw
        st = best.get("st", {})
        speaker = str(st.get("rl", "0"))
        seg_chars: list[str] = []
        for rt_item in st.get("rt", []):
            for ws in rt_item.get("ws", []):
                for cw in ws.get("cw", []):
                    seg_chars.append(cw.get("w", ""))
        seg_text = "".join(seg_chars).strip()
        if not seg_text:
            continue
        segments.append(
            {
                "speaker": speaker,
                "start_ms": int(st.get("bg") or 0),
                "end_ms": int(st.get("ed") or 0),
                "text": seg_text,
            }
        )
        text_parts.append(seg_text)

    return {"status": "complete", "text": "".join(text_parts), "segments": segments}
