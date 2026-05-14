package com.xg.business.workstudy.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * 批量动作的汇总返回。每个 application 独立处理，前端按这个展示"成功 X / 跳过 Y"。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BatchActionResult {

    private int succeeded;
    private int skipped;
    private List<Failure> failures = new ArrayList<>();

    public void addFailure(Long applicationId, String code, String message) {
        failures.add(new Failure(applicationId, code, message));
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Failure {
        private Long applicationId;
        private String code;
        private String message;
    }
}
