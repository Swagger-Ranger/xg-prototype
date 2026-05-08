package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CounselorMappingView {
    private Long id;
    private Long counselorId;
    private String counselorName;
    private Long orgId;
    private String orgName;
    /** 'college' 或 'class'。 */
    private String orgType;
    private Boolean isPrimary;
}
