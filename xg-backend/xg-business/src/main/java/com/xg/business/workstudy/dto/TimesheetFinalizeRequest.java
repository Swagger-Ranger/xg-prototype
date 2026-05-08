package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
public class TimesheetFinalizeRequest {

    @NotNull
    @DecimalMin("0.0")
    @DecimalMax("744.0")
    private BigDecimal hoursFinal;

    @Size(max = 2000)
    private String note;
}
