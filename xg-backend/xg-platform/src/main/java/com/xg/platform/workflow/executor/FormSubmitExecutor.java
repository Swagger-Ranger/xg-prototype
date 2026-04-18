package com.xg.platform.workflow.executor;

import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.mapper.FormDataMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class FormSubmitExecutor implements NodeExecutor {

    private final FormDataMapper formDataMapper;

    @Override
    public NodeType getType() {
        return NodeType.FORM_SUBMIT;
    }

    @Override
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        // Form data is already persisted during WorkflowEngine.startWorkflow().
        // Just advance to the next node.
        String next = (String) nodeDef.get("next");
        return ExecutionResult.advance(next);
    }
}
