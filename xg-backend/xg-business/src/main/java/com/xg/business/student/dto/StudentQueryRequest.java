package com.xg.business.student.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class StudentQueryRequest extends PageQuery {
    private String keyword;
    private String grade;
    private String status;
    private String college;
    private String major;
    private String className;
}
