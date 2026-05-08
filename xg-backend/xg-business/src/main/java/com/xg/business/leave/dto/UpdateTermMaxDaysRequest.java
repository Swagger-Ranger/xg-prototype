package com.xg.business.leave.dto;

import lombok.Data;

import java.math.BigDecimal;

/** PUT /leave-types/{code}/term-max-days 入参。 */
@Data
public class UpdateTermMaxDaysRequest {
    /** 本学期累计请假上限。null = 不限。 */
    private BigDecimal termMaxDays;
}
