package com.xg.business.workstudy.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class EmployerQueryRequest extends PageQuery {
    private String keyword;   // 单位名称模糊
    private String status;    // active / disabled
    private Long leaderUserId;
}
