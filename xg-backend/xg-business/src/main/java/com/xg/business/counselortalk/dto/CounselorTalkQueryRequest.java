package com.xg.business.counselortalk.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CounselorTalkQueryRequest extends PageQuery {
    private Long studentId;
    private Long counselorId;
    private String topic;
}
