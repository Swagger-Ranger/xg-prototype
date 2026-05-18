package com.xg.business.counselortalk.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName("counselor_talk")
public class CounselorTalk extends BaseEntity {

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("counselor_id")
    private Long counselorId;

    @TableField("counselor_name")
    private String counselorName;

    private String topic;
    private String content;

    @TableField("follow_up")
    private String followUp;

    @TableField("talk_at")
    private OffsetDateTime talkAt;

    @TableField("source_alert_id")
    private Long sourceAlertId;

    /** AI 观察员「主动关怀」卡片「发起谈话」回链的 care_task.id（单向）。 */
    @TableField("source_care_task_id")
    private Long sourceCareTaskId;
}
