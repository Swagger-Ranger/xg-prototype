package com.xg.business.ai.controller;

import com.xg.common.base.R;
import com.xg.platform.insight.client.AiSidecarClient;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 桥接到 sidecar 的文本润色端点。把"驳回原因"草稿转给 LLM 改写。
 * Sidecar 失败时返回 polished=原文 + errorMessage，前端 UI 不阻塞。
 */
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Validated
public class AiPolishController {

    private final AiSidecarClient aiSidecarClient;

    @PostMapping("/polish-rejection")
    public R<PolishRejectionResponse> polishRejection(@RequestBody @Validated PolishRejectionRequest req) {
        AiSidecarClient.PolishResult result = aiSidecarClient.polishRejection(req.getDraft(), req.getContext());
        PolishRejectionResponse resp = new PolishRejectionResponse();
        resp.setPolished(result.polished());
        resp.setModel(result.model());
        resp.setErrorMessage(result.errorMessage());
        return R.ok(resp);
    }

    @Data
    public static class PolishRejectionRequest {
        @NotBlank
        @Size(max = 2000)
        private String draft;

        @Size(max = 1500)
        private String context;
    }

    @Data
    public static class PolishRejectionResponse {
        private String polished;
        private String model;
        private String errorMessage;
    }
}
