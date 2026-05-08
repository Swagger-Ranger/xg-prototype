package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

/** 可指派为班主任 / 辅导员的候选用户。 */
@Getter
@Setter
public class AssignableUser {
    private Long id;
    private String realName;
    private String username;
}
