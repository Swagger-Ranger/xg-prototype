package com.xg.business.leave.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

/**
 * 「请假须知」租户级配置：
 *  - 进入请假页弹「说明」(noticeEnabled / noticeText)
 *  - 提交前弹「承诺书」(commitmentEnabled / commitmentText / commitmentCountdownSec)
 *
 * 序列化进 public.tenant.config -> leaveNoticeConfig 键。缺失字段走 Defaults。
 */
@Data
public class LeaveNoticeConfig {
    private Boolean noticeEnabled;
    private String noticeText;
    private Boolean commitmentEnabled;
    private String commitmentText;
    @Min(0)
    @Max(60)
    private Integer commitmentCountdownSec;
}
