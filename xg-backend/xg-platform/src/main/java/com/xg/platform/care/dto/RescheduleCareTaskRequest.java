package com.xg.platform.care.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.Set;

/**
 * 改期请求。days 只允许 1 / 3 / 7（PRD §16.2 改期约束）。
 * service 层会再校验 reschedule_count 上限。
 */
@Getter
@Setter
public class RescheduleCareTaskRequest {

    public static final Set<Integer> ALLOWED_DAYS = Set.of(1, 3, 7);

    @NotNull
    private Integer days;
}
