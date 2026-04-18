package com.xg.platform.workflow.engine;

import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

@Getter
public class BatchApproveResult {

    private int successCount;
    private int failCount;
    private final List<String> failures = new ArrayList<>();

    public void addSuccess() {
        successCount++;
    }

    public void addFailure(Long taskId, String reason) {
        failCount++;
        failures.add("taskId=" + taskId + ": " + reason);
    }
}
