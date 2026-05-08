package com.xg.business.leave.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;

/** 学生申请人工销假入参(GPS 不命中时的兜底通道)。 */
@Data
public class ManualReturnApplyRequest {
    @NotBlank(message = "请填写人工销假理由")
    @Size(max = 1000, message = "理由不超过 1000 字")
    private String reason;
    /** 可选附件,前端走 MinIO 上传完后把 [{name,url,size}, ...] 列表传过来。 */
    private List<Map<String, Object>> attachments;
}
