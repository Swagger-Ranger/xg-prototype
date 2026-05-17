package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * Student-initiated resignation payload. Reason is fixed (resigned_by_student) so only
 * the free-text {@code note} is accepted.
 */
@Getter
@Setter
public class OffboardByStudentRequest {

    @Size(max = 2000)
    private String note;
}
