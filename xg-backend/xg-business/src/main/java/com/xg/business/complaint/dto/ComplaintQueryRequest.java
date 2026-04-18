package com.xg.business.complaint.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ComplaintQueryRequest extends PageQuery {
    private String status;
    private String category;
}
