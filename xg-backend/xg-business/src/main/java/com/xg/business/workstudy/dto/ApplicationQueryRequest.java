package com.xg.business.workstudy.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ApplicationQueryRequest extends PageQuery {
    private Long positionId;
    private Long studentId;
    private String status;
    /** Post-hire lifecycle filter: on_duty / offboarded. Independent of {@link #status}. */
    private String engagementStatus;

    /**
     * Comma-separated relation keys to expand inline. Currently supports
     * {@code position} → fills each row's {@code positionSummary} with
     * (id, title, position_type, department_name, salary_unit, salary_amount).
     */
    private String include;
}
