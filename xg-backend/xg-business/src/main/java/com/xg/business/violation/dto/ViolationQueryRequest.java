package com.xg.business.violation.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class ViolationQueryRequest extends PageQuery {
    private Long studentId;
    private String category;
    private LocalDate startDate;
    private LocalDate endDate;
    private String approvalStatus;
    private Long recorderId;
}
