package com.xg.platform.workflow.executor;

import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.WorkflowInstanceMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class EndExecutor implements NodeExecutor {

    private final WorkflowInstanceMapper instanceMapper;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    public NodeType getType() {
        return NodeType.END;
    }

    @Override
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        String finalStatus = (String) nodeDef.getOrDefault("status", "completed");
        instance.setStatus(finalStatus);
        instance.setFinishedAt(OffsetDateTime.now());
        instanceMapper.updateById(instance);
        eventPublisher.publishEvent(new WorkflowFinishedEvent(instance, (String) nodeDef.get("id")));
        return ExecutionResult.terminal();
    }
}
