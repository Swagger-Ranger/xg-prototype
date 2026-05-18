package com.xg.business.workflow.listener;

import com.xg.platform.workflow.event.WorkflowAssigneeMissingEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 审批节点无受理人的灰度期告警(RBAC 落地方案 §5.5 第一步)。
 *
 * <p>当前没有"按角色派给管理员"的通知收件人类型,也没有租户级 audit 写入器;
 * 强行硬编码某个 static_user 的 admin id 既脆弱又租户相关。灰度期真正的发现手段
 * 是 §5.5 的扫描脚本(S1-5,扫"运行中 + approval 节点 + 无 pending task")。
 * 这里只把事件落成一条带稳定标记 {@code WORKFLOW_ASSIGNEE_MISSING} 的高优先日志,
 * 供日志告警接管;它同时是 Sprint 2 fail-fast / 管理员通知接入的解耦缝。
 *
 * <p>故意用 {@link EventListener} 而非 AFTER_COMMIT:即使 suspend 所在事务最终回滚,
 * "解析不到受理人" 这件事本身也值得记录,不应被事务结果吞掉。
 */
@Slf4j
@Component
public class WorkflowAssigneeMissingAlerter {

    @EventListener
    public void onAssigneeMissing(WorkflowAssigneeMissingEvent e) {
        log.error("WORKFLOW_ASSIGNEE_MISSING tenant={} instance={} biz={}:{} node={}({}) assignee={}|{} —— "
                        + "审批节点解析不到受理人,流程已 suspend;请检查该 role/scope 是否有人绑定或定义是否配错",
                e.getTenantId(), e.getInstanceId(), e.getBizType(), e.getBizId(),
                e.getNodeId(), e.getNodeName(), e.getRole(), e.getScope());
    }
}
