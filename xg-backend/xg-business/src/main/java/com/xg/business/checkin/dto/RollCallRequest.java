package com.xg.business.checkin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class RollCallRequest {

    @NotNull
    private List<RollCallEntry> records;

    @Getter
    @Setter
    public static class RollCallEntry {

        @NotNull
        private Long studentId;

        @NotBlank
        private String status;
    }
}
