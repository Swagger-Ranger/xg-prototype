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
}
