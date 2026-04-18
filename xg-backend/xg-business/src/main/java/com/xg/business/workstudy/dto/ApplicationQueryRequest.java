package com.xg.business.workstudy.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ApplicationQueryRequest extends PageQuery {
    private Long positionId;
    private Long studentId;
    private String status;
}
