package com.xg.business.violation.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ViolationErrorCode implements ErrorCode {

    VIOLATION_NOT_FOUND("VIOLATION_NOT_FOUND", "违纪记录不存在"),
    PUNISHMENT_NOT_FOUND("PUNISHMENT_NOT_FOUND", "处分记录不存在");

    private final String code;
    private final String message;
}
