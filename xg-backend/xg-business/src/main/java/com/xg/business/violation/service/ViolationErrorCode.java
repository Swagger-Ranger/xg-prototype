package com.xg.business.violation.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ViolationErrorCode implements ErrorCode {

    VIOLATION_NOT_FOUND("VIOLATION_NOT_FOUND", "违纪记录不存在"),
    PUNISHMENT_NOT_FOUND("PUNISHMENT_NOT_FOUND", "处分记录不存在"),
    VIOLATION_INVALID_STATUS("VIOLATION_INVALID_STATUS", "违纪记录当前状态不允许该操作"),
    VIOLATION_NOT_APPROVED("VIOLATION_NOT_APPROVED", "违纪记录未审批通过，无法申诉"),
    APPEAL_NOT_FOUND("APPEAL_NOT_FOUND", "申诉记录不存在"),
    APPEAL_ALREADY_EXISTS("APPEAL_ALREADY_EXISTS", "该违纪记录已存在未处理或已通过的申诉"),
    APPEAL_INVALID_STATUS("APPEAL_INVALID_STATUS", "申诉当前状态不允许该操作"),
    APPEAL_NOT_OWNED("APPEAL_NOT_OWNED", "只能对本人的违纪记录提起申诉");

    private final String code;
    private final String message;
}
