package com.xg.platform.alert.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AlertQueryRequest extends PageQuery {
    private String status;
    private String severity;
    private Long studentId;
}
