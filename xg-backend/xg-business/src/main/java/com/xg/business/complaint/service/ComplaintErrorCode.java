package com.xg.business.complaint.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ComplaintErrorCode implements ErrorCode {

    COMPLAINT_NOT_FOUND("COMPLAINT_NOT_FOUND", "诉求记录不存在"),
    COMPLAINT_ALREADY_REPLIED("COMPLAINT_ALREADY_REPLIED", "该诉求已回复"),
    COMPLAINT_NOT_REPLIED("COMPLAINT_NOT_REPLIED", "诉求尚未回复，无法评价"),
    COMPLAINT_ALREADY_RATED("COMPLAINT_ALREADY_RATED", "该诉求已评价");

    private final String code;
    private final String message;
}
