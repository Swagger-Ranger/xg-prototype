package com.xg.business.observer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
public class SaveObserverCardRequest {

    @NotBlank
    @Size(max = 80)
    private String title;

    @NotBlank
    private String nlQuery;

    /** LLM 出的原始 SQL,后端会再过一次 QueryGuard 校验 + EXPLAIN。 */
    @NotBlank
    private String sqlText;

    /** statistic | bar | line | pie | table | trend */
    @NotBlank
    private String chartType;

    private Map<String, Object> chartOpts;

    /** 默认 300(5 分钟)。 */
    private Integer refreshSec;
}
