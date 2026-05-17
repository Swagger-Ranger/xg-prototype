package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 批量终止上岗（A3）。每个 application 独立检查授权，跳过失败的，返回汇总结果。
 * 上限 200 条，避免一次性请求过长。
 */
@Getter
@Setter
public class BatchOffboardRequest {

    @NotEmpty
    @Size(max = 200)
    private List<Long> applicationIds;

    /** completed | terminated_by_employer；其他值 / 空值归一化为 terminated_by_employer */
    @Size(max = 32)
    private String reason;

    @Size(max = 2000)
    private String note;
}
