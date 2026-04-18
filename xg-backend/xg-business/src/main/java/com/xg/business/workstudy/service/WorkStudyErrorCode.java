package com.xg.business.workstudy.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum WorkStudyErrorCode implements ErrorCode {

    POSITION_NOT_FOUND("POSITION_NOT_FOUND", "勤工助学岗位不存在"),
    POSITION_CLOSED("POSITION_CLOSED", "岗位已关闭或不在招募中"),
    POSITION_FULL("POSITION_FULL", "岗位已招满"),
    APPLICATION_NOT_FOUND("APPLICATION_NOT_FOUND", "申请不存在"),
    APPLICATION_ALREADY_EXISTS("APPLICATION_ALREADY_EXISTS", "已申请过该岗位"),
    APPLICATION_ALREADY_DECIDED("APPLICATION_ALREADY_DECIDED", "申请已处理，不可重复决定"),
    INVALID_DECISION_STATUS("INVALID_DECISION_STATUS", "决定状态非法");

    private final String code;
    private final String message;
}
