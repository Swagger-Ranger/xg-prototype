package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class LeaveApplyRequest {

    @NotBlank
    private String leaveTypeCode;

    @NotNull
    private OffsetDateTime startTime;

    @NotNull
    private OffsetDateTime endTime;

    @NotBlank
    private String reason;

    private List<Long> attachmentFileIds;

    private Map<String, Object> extraData;

    // Optional browser geolocation captured at submit time. All three fields
    // null means the student declined the permission or the API failed.
    private BigDecimal applyLatitude;
    private BigDecimal applyLongitude;
    private OffsetDateTime applyLocationAt;

    /**
     * Snapshot of what AI prefilled (when the form was opened via chat agent).
     * Persisted onto leave_request.ai_draft so we can diff predictions vs the
     * student's final values after submit, and feed that signal back into
     * prompt tuning. Null when the student opened the form manually.
     * Expected shape:
     *   { source, model, raw_input, predicted_fields: {...}, confidence, generated_at }
     */
    private Map<String, Object> aiDraft;
}
