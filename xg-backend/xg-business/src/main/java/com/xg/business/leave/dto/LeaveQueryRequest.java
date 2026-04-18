package com.xg.business.leave.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class LeaveQueryRequest extends PageQuery {

    private String status;

    private String leaveTypeCode;

    private LocalDate startDate;

    private LocalDate endDate;
}
