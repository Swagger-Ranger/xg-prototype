package com.xg.business.violation.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ViolationAppealQueryRequest extends PageQuery {
    private Long studentId;
    private String status;
}
