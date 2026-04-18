package com.xg.platform.workflow.executor;

import com.xg.common.exception.BizException;
import com.xg.platform.workflow.engine.ExecutionResult;
import com.xg.platform.workflow.engine.NodeExecutor;
import com.xg.platform.workflow.engine.NodeType;
import com.xg.platform.workflow.expression.ExpressionEvaluator;
import com.xg.platform.workflow.model.WorkflowInstance;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class ConditionExecutor implements NodeExecutor {

    private final ExpressionEvaluator evaluator;

    @Override
    public NodeType getType() {
        return NodeType.CONDITION;
    }

    @Override
    @SuppressWarnings("unchecked")
    public ExecutionResult execute(WorkflowInstance instance, Map<String, Object> nodeDef) {
        List<Map<String, Object>> branches = (List<Map<String, Object>>) nodeDef.get("branches");
        Map<String, Object> context = instance.getContext();

        for (Map<String, Object> branch : branches) {
            String when = (String) branch.get("when");
            if (when == null || "true".equals(when) || "default".equals(when)) {
                return ExecutionResult.advance((String) branch.get("next"));
            }
            if (evaluator.evaluate(when, context)) {
                return ExecutionResult.advance((String) branch.get("next"));
            }
        }

        throw new BizException("WORKFLOW_NO_MATCHING_BRANCH",
                "条件节点 " + nodeDef.get("id") + " 没有匹配的分支");
    }
}
