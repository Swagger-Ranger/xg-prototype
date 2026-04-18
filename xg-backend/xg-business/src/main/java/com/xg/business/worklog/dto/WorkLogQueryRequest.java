package com.xg.business.worklog.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class WorkLogQueryRequest extends PageQuery {
    private String category;
    private LocalDate startDate;
    private LocalDate endDate;
}
