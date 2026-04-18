package com.xg.business.worklog.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum WorkLogErrorCode implements ErrorCode {

    WORK_LOG_NOT_FOUND("WORK_LOG_NOT_FOUND", "工作日志不存在"),
    WORK_LOG_FORBIDDEN("WORK_LOG_FORBIDDEN", "无权操作此工作日志");

    private final String code;
    private final String message;
}
