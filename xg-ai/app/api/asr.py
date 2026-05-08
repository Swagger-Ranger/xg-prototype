"""语音识别端点（讯飞 lfasr 录音文件转写）。

POST /api/v1/asr/transcribe        multipart 上传音频，返回 order_id
GET  /api/v1/asr/transcribe/{id}   轮询识别结果
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.asr import xfyun_lfasr

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/asr", tags=["asr"])

MAX_FILE_BYTES = 500 * 1024 * 1024  # 讯飞硬上限 500MB


@router.post("/transcribe")
async def submit(
    audio: UploadFile = File(...),
    duration_ms: int | None = Form(default=None),
    role_separation: bool = Form(default=False),
    role_num: int = Form(default=0),
    hot_words: str | None = Form(default=None),
) -> dict[str, Any]:
    data = await audio.read()
    if not data:
        raise HTTPException(400, "空文件")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "文件超过 500MB 上限")

    try:
        order_id = await xfyun_lfasr.upload(
            data,
            file_name=audio.filename or "audio.mp3",
            duration_ms=duration_ms,
            role_separation=role_separation,
            role_num=role_num,
            hot_words=hot_words,
        )
    except xfyun_lfasr.XfyunAsrError as e:
        logger.error("讯飞上传失败: %s", e)
        raise HTTPException(502, str(e))
    return {"order_id": order_id}


@router.get("/transcribe/{order_id}")
async def query(order_id: str) -> dict[str, Any]:
    try:
        content = await xfyun_lfasr.get_result(order_id)
    except xfyun_lfasr.XfyunAsrError as e:
        logger.error("讯飞查询失败: %s", e)
        raise HTTPException(502, str(e))
    return xfyun_lfasr.parse_transcript(content)
