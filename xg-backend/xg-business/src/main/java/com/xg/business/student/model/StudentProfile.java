package com.xg.business.student.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
@TableName(value = "student_profile", autoResultMap = true)
public class StudentProfile extends BaseEntity {

    @TableField("user_id")
    private Long userId;

    @TableField("student_no")
    private String studentNo;

    @TableField("grade")
    private String grade;

    @TableField("college")
    private String college;

    @TableField("major")
    private String major;

    @TableField("class_name")
    private String className;

    @TableField("class_id")
    private Long classId;

    @TableField("enrollment_date")
    private LocalDate enrollmentDate;

    @TableField("status")
    private String status;
}
