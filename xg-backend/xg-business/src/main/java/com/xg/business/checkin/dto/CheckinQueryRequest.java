package com.xg.business.checkin.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CheckinQueryRequest extends PageQuery {

    private String status;
}
