package com.xg.business.counselortalk.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum CounselorTalkErrorCode implements ErrorCode {

    COUNSELOR_TALK_NOT_FOUND("COUNSELOR_TALK_NOT_FOUND", "谈话记录不存在");

    private final String code;
    private final String message;
}
