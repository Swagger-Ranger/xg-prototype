package com.xg.business.workstudy.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PositionQueryRequest extends PageQuery {
    private String status;
    private String positionType;
    private Boolean preferFinancialAid;
    private String academicYear;
    private Long employerId;

    /** When true and called by a student, filter out positions the student is not eligible for. */
    private Boolean studentScope;
}
