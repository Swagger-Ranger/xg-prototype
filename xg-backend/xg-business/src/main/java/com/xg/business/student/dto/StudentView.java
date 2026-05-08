package com.xg.business.student.dto;

import com.fasterxml.jackson.annotation.JsonRawValue;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Merged view of sys_user + student_profile for student listing / detail pages.
 */
@Getter
@Setter
public class StudentView {
    private Long id;                       // student_profile.id
    private Long userId;                   // sys_user.id
    private String studentNo;              // 学号
    private String name;                   // sys_user.real_name
    private String gender;
    private String grade;
    private String college;
    private String major;
    private String className;
    private String phone;
    private String email;
    private String status;                 // student_profile.status
    private String educationLevel;         // 培养层次：本科/硕士/博士/专科
    private LocalDate enrollmentDate;
    private OffsetDateTime createdAt;

    /** 扩展字段原始 JSONB，以嵌套对象形式下发给前端（由 field_definition 元数据描述） */
    @JsonRawValue
    private String extendedInfo;
}
