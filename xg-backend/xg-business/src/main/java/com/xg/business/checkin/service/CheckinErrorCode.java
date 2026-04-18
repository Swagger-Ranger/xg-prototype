package com.xg.business.checkin.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum CheckinErrorCode implements ErrorCode {

    ACTIVITY_NOT_FOUND("CHECKIN_ACTIVITY_NOT_FOUND", "签到活动不存在"),
    ACTIVITY_NOT_ACTIVE("CHECKIN_ACTIVITY_NOT_ACTIVE", "签到活动未在进行中"),
    ACTIVITY_ENDED("CHECKIN_ACTIVITY_ENDED", "签到活动已结束"),
    ALREADY_SIGNED("CHECKIN_ALREADY_SIGNED", "已签到，请勿重复签到"),
    INVALID_QR("CHECKIN_INVALID_QR", "二维码无效或已过期"),
    NOT_IN_SCOPE("CHECKIN_NOT_IN_SCOPE", "不在签到范围内");

    private final String code;
    private final String message;
}
