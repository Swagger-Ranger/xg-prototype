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

    /** Post-hire lifecycle: null (未录用) / on_duty / offboarded. Decoupled from {@link #status}. */
    @TableField("engagement_status")
    private String engagementStatus;

    @TableField("engaged_at")
    private OffsetDateTime engagedAt;

    @TableField("offboarded_at")
    private OffsetDateTime offboardedAt;

    /** completed / terminated_by_employer / resigned_by_student */
    @TableField("offboard_reason")
    private String offboardReason;

    @TableField("offboard_note")
    private String offboardNote;

    @TableField("offboard_operator_id")
    private Long offboardOperatorId;

    @TableField("interview_at")
    private OffsetDateTime interviewAt;

    @TableField("interview_location")
    private String interviewLocation;

    @TableField("interview_notes")
    private String interviewNotes;

    @TableField("interview_notified_at")
    private OffsetDateTime interviewNotifiedAt;

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

        /**
         * 从 Position 构建 Summary，对历史 legacy 数据自动 fallback：
         * salary_amount 为空但有 hourly_rate 时，按 unit='hour' 提升，确保前端申请视图能展示薪资。
         */
        public static PositionSummary fromPosition(WorkStudyPosition p) {
            String unit = p.getSalaryUnit();
            java.math.BigDecimal amount = p.getSalaryAmount();
            if (amount == null && p.getHourlyRate() != null) {
                unit = "hour";
                amount = p.getHourlyRate();
            }
            return new PositionSummary(p.getId(), p.getTitle(), p.getPositionType(),
                    p.getDepartmentName(), unit, amount);
        }
    }
}
