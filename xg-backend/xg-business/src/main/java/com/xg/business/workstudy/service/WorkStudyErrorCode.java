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
    STUDENT_FIXED_LIMIT_REACHED("STUDENT_FIXED_LIMIT_REACHED", "本学年固定岗在岗数已达上限"),
    STUDENT_TEMP_LIMIT_REACHED("STUDENT_TEMP_LIMIT_REACHED", "本学年临时岗在岗数已达上限"),
    POSITION_INELIGIBLE("POSITION_INELIGIBLE", "不符合岗位申请条件"),
    APPLICATION_NOT_FOUND("APPLICATION_NOT_FOUND", "申请不存在"),
    APPLICATION_ALREADY_EXISTS("APPLICATION_ALREADY_EXISTS", "已申请过该岗位"),
    APPLICATION_ALREADY_DECIDED("APPLICATION_ALREADY_DECIDED", "申请已处理，不可重复决定"),
    INVALID_DECISION_STATUS("INVALID_DECISION_STATUS", "决定状态非法"),
    APPLICATION_NOT_HIRED("APPLICATION_NOT_HIRED", "岗位申请尚未录用，无法上报工时"),
    TIMESHEET_NOT_FOUND("TIMESHEET_NOT_FOUND", "工时记录不存在"),
    TIMESHEET_ALREADY_REPORTED("TIMESHEET_ALREADY_REPORTED", "该月工时已上报"),
    TIMESHEET_NOT_PENDING_CONFIRM("TIMESHEET_NOT_PENDING_CONFIRM", "当前工时状态不允许学生确认"),
    TIMESHEET_NOT_DISPUTED("TIMESHEET_NOT_DISPUTED", "工时未处于异议状态，无法裁定"),
    TIMESHEET_NO_PENDING_TASK("TIMESHEET_NO_PENDING_TASK", "工时工作流无待办任务"),
    WORKFLOW_NO_PENDING_TASK("WORKFLOW_NO_PENDING_TASK", "工作流无待办任务"),
    SALARY_NOT_FOUND("SALARY_NOT_FOUND", "薪资记录不存在"),
    SALARY_NOT_PENDING("SALARY_NOT_PENDING", "薪资记录已处理或不在审批中"),
    SALARY_INVALID_POSITION_RATE("SALARY_INVALID_POSITION_RATE", "岗位未配置薪资单位或单价，无法申报"),
    APPLICATION_NOT_HIRED_FOR_SALARY("APPLICATION_NOT_HIRED_FOR_SALARY", "学生未在该岗位录用，不能申报薪资");

    private final String code;
    private final String message;
}
