package com.xg.business.leave.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum LeaveErrorCode implements ErrorCode {

    LEAVE_TYPE_NOT_FOUND("LEAVE_TYPE_NOT_FOUND", "假别不存在"),
    LEAVE_TYPE_DISABLED("LEAVE_TYPE_DISABLED", "该假别已停用"),
    LEAVE_TIME_OVERLAP("LEAVE_TIME_OVERLAP", "请假时间与已有记录重叠"),
    LEAVE_NOT_FOUND("LEAVE_NOT_FOUND", "请假记录不存在"),
    LEAVE_CANNOT_WITHDRAW("LEAVE_CANNOT_WITHDRAW", "当前状态不可撤回"),
    LEAVE_CANNOT_CANCEL("LEAVE_CANNOT_CANCEL", "当前状态不可销假");

    private final String code;
    private final String message;
}
