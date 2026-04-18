package com.xg.platform.system.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SystemUserQueryRequest extends PageQuery {
    private String keyword;
    private String status;
    private String roleCode;
}
