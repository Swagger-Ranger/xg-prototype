package com.xg.business.leave.dto;

import lombok.Data;

import java.math.BigDecimal;

/** PUT /leaves/global-config 入参。 */
@Data
public class UpdateTermMaxDaysRequest {
    /** 全学期累计请假上限(全部假别合计)。null = 不限。 */
    private BigDecimal termMaxDays;
}
