package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 批量发通知（A3）—— 给选中申请的学生发一条 ad-hoc 站内信。
 * 不走 Orchestrator：dedup 设计与 ad-hoc 广播语义冲突（同模板同 source_id 只能发一次），
 * 直接走 NotificationService 写 in_app 通道。
 */
@Getter
@Setter
public class BatchNotifyRequest {

    @NotEmpty
    @Size(max = 200)
    private List<Long> applicationIds;

    @NotBlank
    @Size(max = 200)
    private String title;

    @NotBlank
    @Size(max = 4000)
    private String body;
}
