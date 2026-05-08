package com.xg.business.workstudy.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SalaryQueryRequest extends PageQuery {
    private Long studentId;
    private Long positionId;
    private String month;
    private String status;          // draft / pending / confirmed / rejected / paid
    private String positionType;    // fixed / temporary

    /** Comma-separated relation keys; supports {@code position}. */
    private String include;
}
