package com.xg.platform.alert.dsl;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AlertRuleDsl(
        String name,
        String description,
        String nlSource,
        Boolean enabled,
        ScopeSpec scope,
        WindowSpec window,
        Map<String, AggregationSpec> aggregations,
        String condition,
        Integer severity,
        Integer cooldownDays,
        ActionSpec action,
        Map<String, AiHookSpec> aiHooks
) {}
