package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class UpdateLeaveTypeFieldsRequest {
    /**
     * GUI-editor-shaped field payloads (name/label/type/widget/options/...).
     * The service translates them to {@code field_key/field_label/field_type/...}
     * before writing to {@code leave_type_config.extra_fields}.
     */
    @NotNull
    private List<Map<String, Object>> fields;
}
