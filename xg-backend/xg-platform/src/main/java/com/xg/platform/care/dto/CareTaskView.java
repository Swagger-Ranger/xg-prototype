package com.xg.platform.care.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * 关怀任务前端视图（W1 §2.3 / §4.1）。controller list/detail 返回此 DTO 而非裸
 * {@code CareTask}。
 *
 * <p><b>W1 §4.5 守门</b>：刻意<b>不</b>携带 {@code rule_id} / {@code rule_version} /
 * {@code assigned_to} / 原始 {@code trigger_data} —— 英文代号 / 内部字段不出网。
 * {@code triggerSummary} 已服务端渲染成中文句；{@code triggerEvidence} 是去掉
 * 规则代号后的证据快照。
 *
 * <p>{@code historyCount} / {@code triggerEvidence} 仅 detail 填充，列表为 null
 * （列表卡片用不到，避免逐行子查询）。
 */
@Data
public class CareTaskView {

    private Long taskId;
    private Long studentId;
    private String studentName;
    private String className;

    /** 原始 severity code（critical/high/medium/low），前端按 W1 §2.3 映射中文 */
    private String severity;
    /** 原始 status code，前端映射中文徽章 */
    private String status;

    /** 服务端渲染的一句话触发摘要（不含 rule_id） */
    private String triggerSummary;

    private OffsetDateTime dueAt;

    /** current_brief.why 截 60 字；无可用 brief 时 null */
    private String briefSummary;
    /** ready=有可展示 brief；pending=缺失待懒加载（failed 由前端运行期派生） */
    private String briefStatus;

    private Integer rescheduleCount;
    private OffsetDateTime acceptedAt;
    private OffsetDateTime closedAt;
    private String closedReason;
    private String transferredTo;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    /** 该生历史关怀次数（终态任务，detail 专用，列表为 null） */
    private Integer historyCount;
    /** 去掉 rule_id/rule_version 的证据快照（detail「触发证据」区，列表为 null） */
    private Map<String, Object> triggerEvidence;
}
