package com.xg.business.academic.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ClassScheduleUpsert {

    @NotNull
    private Long classId;

    @NotBlank
    private String termCode;

    /** 'manual' / 'edu_admin_sync' / 'imported_xxx'. Optional, defaults to 'manual'. */
    private String source;

    /** Raw JSONB string — array of course entries.
     *  See {@code class_schedule.entries} comment in V071 migration. */
    @NotBlank
    private String entries;
}
