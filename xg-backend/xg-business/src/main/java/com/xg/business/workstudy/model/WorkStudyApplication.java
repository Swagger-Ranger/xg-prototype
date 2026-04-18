package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "work_study_application", autoResultMap = true)
public class WorkStudyApplication extends BaseEntity {

    @TableField("position_id")
    private Long positionId;

    @TableField("student_id")
    private Long studentId;

    @TableField("student_name")
    private String studentName;

    @TableField("financial_aid_level")
    private String financialAidLevel;

    @TableField("intro")
    private String intro;

    @TableField("status")
    private String status;

    @TableField("decision_note")
    private String decisionNote;

    @TableField("decided_by")
    private Long decidedBy;

    @TableField("decided_at")
    private OffsetDateTime decidedAt;
}
