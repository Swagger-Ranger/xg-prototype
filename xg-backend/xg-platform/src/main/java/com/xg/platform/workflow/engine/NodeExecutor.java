package com.xg.platform.workflow.engine;

import com.xg.platform.workflow.model.WorkflowInstance;

import java.util.Map;

public interface NodeExecutor {

    NodeType getType();

    ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDefinition);
}
