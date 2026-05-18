package com.xg.platform.care.domain;

/**
 * 关怀任务状态机事件（CareTaskService.transition() 入口的 event 参数）。
 * 区别于 student_event_log 的"业务事件"，这里是任务自身的"动作"。
 */
public enum CareTaskEvent {

    /** 辅导员接单 */
    ACCEPT,
    /** 辅导员拒绝（必填 reason_code，写 feedback） */
    REJECT,
    /** 转介其他部门（必填 target_dept + reason_detail） */
    TRANSFER,
    /** 改期（days ∈ {1,3,7}，reschedule_count +1） */
    RESCHEDULE,
    /** 完成 */
    RESOLVE,
    /** Service 内部推进：accepted → in_progress（首次保存跟进记录时触发） */
    SAVE_FOLLOWUP,
    /** 系统定时任务：due_at 已过，未关闭则迁移到 OVERDUE */
    OVERDUE_TICK
}
