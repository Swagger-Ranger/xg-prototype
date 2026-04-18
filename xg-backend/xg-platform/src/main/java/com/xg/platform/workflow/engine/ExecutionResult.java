package com.xg.platform.workflow.engine;

import lombok.Getter;

@Getter
public class ExecutionResult {

    private final boolean suspended;
    private final String nextNodeId;

    private ExecutionResult(boolean suspended, String nextNodeId) {
        this.suspended = suspended;
        this.nextNodeId = nextNodeId;
    }

    public static ExecutionResult advance(String nextNodeId) {
        return new ExecutionResult(false, nextNodeId);
    }

    public static ExecutionResult suspend() {
        return new ExecutionResult(true, null);
    }

    public static ExecutionResult terminal() {
        return new ExecutionResult(false, null);
    }
}
