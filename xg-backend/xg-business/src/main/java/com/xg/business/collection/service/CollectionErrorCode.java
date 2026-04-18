package com.xg.business.collection.service;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum CollectionErrorCode implements ErrorCode {

    FORM_NOT_FOUND("FORM_NOT_FOUND", "收集单不存在"),
    FORM_NOT_PUBLISHED("FORM_NOT_PUBLISHED", "收集单未发布"),
    FORM_CLOSED("FORM_CLOSED", "收集单已关闭"),
    FORM_DEADLINE_PASSED("FORM_DEADLINE_PASSED", "已超过截止时间"),
    ALREADY_SUBMITTED("ALREADY_SUBMITTED", "已提交过，请勿重复提交"),
    SUBMISSION_NOT_FOUND("SUBMISSION_NOT_FOUND", "填报记录不存在"),
    EDIT_NOT_ALLOWED("EDIT_NOT_ALLOWED", "该收集单不允许修改");

    private final String code;
    private final String message;
}
