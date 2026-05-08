package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

/** PUT /api/v1/org/{classId}/leader 入参。leaderId=null 表示清空班主任。 */
@Getter
@Setter
public class LeaderUpdateRequest {
    private Long leaderId;
}
