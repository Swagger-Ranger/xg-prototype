package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

/** AI 助手 / 高级模式发布新版本 YAML 的入参。 */
@Getter
@Setter
public class ApplyYamlRequest {
    @NotBlank
    private String bizType;

    /** 学院 override 的 college_id;null = 全校默认。 */
    private Long collegeId;

    @NotBlank
    private String newYaml;

    /** 中文改动说明,记录到 changelog 用,前端从 AI 助手生成的 diff_zh 透传。 */
    private String changeSummary;
}
