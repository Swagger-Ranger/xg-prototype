package com.xg.platform.care.error;

import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 主动关怀工作台错误码。
 * 中文文案直接面向前端 toast / Form 错误展示，沿用 describeApiError 透传 BizException.message。
 */
@Getter
@RequiredArgsConstructor
public enum CareTaskErrorCode implements ErrorCode {

    CARE_TASK_NOT_FOUND("CARE_TASK_NOT_FOUND", "关怀任务不存在或已被删除"),
    CARE_TASK_INVALID_TRANSITION("CARE_TASK_INVALID_TRANSITION", "当前任务状态不允许此操作"),
    CARE_TASK_NOT_ASSIGNED_TO_YOU("CARE_TASK_NOT_ASSIGNED_TO_YOU", "该任务未指派给您，无权操作"),
    CARE_TASK_RESCHEDULE_LIMIT_EXCEEDED("CARE_TASK_RESCHEDULE_LIMIT_EXCEEDED", "改期次数已达上限"),
    CARE_TASK_REJECT_REASON_REQUIRED("CARE_TASK_REJECT_REASON_REQUIRED", "请选择拒绝原因"),
    CARE_TASK_TRANSFER_TARGET_REQUIRED("CARE_TASK_TRANSFER_TARGET_REQUIRED", "请选择转介目标部门并填写说明"),
    CARE_BRIEF_REFRESH_TOO_FREQUENT("CARE_BRIEF_REFRESH_TOO_FREQUENT", "分析过于频繁，请 5 分钟后再试");

    private final String code;
    private final String message;
}
