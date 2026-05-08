package com.xg.business.student.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ClassRosterEntry {
    private Long userId;
    private String studentNo;
    private String name;
    private Long classId;
    private String className;
    private String grade;
    private String status;
}
