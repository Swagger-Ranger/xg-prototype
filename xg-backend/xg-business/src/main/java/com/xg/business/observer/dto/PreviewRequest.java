package com.xg.business.observer.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PreviewRequest {
    /** LLM 出的或用户编辑过的 SQL。preview 会过 QueryGuard 改写 + EXPLAIN + LIMIT 20 真跑一段。 */
    @NotBlank
    private String sqlText;
}
