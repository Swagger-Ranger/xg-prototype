package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "work_study_application", autoResultMap = true)
public class WorkStudyApplication extends BaseEntity {

    @TableField("workflow_instance_id")
    private Long workflowInstanceId;

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

    @TableField(value = "form_data", typeHandler = JsonbTypeHandler.class)
    private String formData;

    /** Inlined position summary when caller asks for {@code include=position}. */
    @TableField(exist = false)
    private PositionSummary positionSummary;

    @lombok.Getter
    @lombok.Setter
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class PositionSummary {
        private Long id;
        private String title;
        private String positionType;
        private String departmentName;
        private String salaryUnit;
        private java.math.BigDecimal salaryAmount;
    }
}
