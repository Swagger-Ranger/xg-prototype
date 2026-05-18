package com.xg.platform.care.domain;

import com.xg.common.exception.BizException;
import com.xg.platform.care.error.CareTaskErrorCode;

import java.util.EnumMap;
import java.util.Map;

import static com.xg.platform.care.domain.CareTaskEvent.*;
import static com.xg.platform.care.domain.CareTaskStatus.*;

/**
 * 关怀任务状态机：静态常量表，不入库 —— 防止规则被运行时改坏。
 * 对应 PRD §10.2 / docs/W1 §5.2。
 *
 * <p>用法：{@code CareTaskStatus next = CareTaskTransitions.next(currentStatus, event);}
 * 不合法时抛 BizException(CARE_TASK_INVALID_TRANSITION)，由全局异常处理器透传中文文案。
 */
public final class CareTaskTransitions {

    private static final Map<CareTaskStatus, Map<CareTaskEvent, CareTaskStatus>> TABLE;

    static {
        EnumMap<CareTaskStatus, Map<CareTaskEvent, CareTaskStatus>> t = new EnumMap<>(CareTaskStatus.class);

        // pending: 接单 / 拒绝 / 转介 / 改期（停留在 pending）/ 超期
        t.put(PENDING, Map.of(
                ACCEPT, ACCEPTED,
                REJECT, REJECTED,
                TRANSFER, TRANSFERRED,
                RESCHEDULE, PENDING,
                OVERDUE_TICK, OVERDUE
        ));

        // accepted: 首次跟进推进 in_progress / 直接完成 / 罕见拒绝 / 转介 / 改期 / 超期
        t.put(ACCEPTED, Map.of(
                SAVE_FOLLOWUP, IN_PROGRESS,
                RESOLVE, RESOLVED,
                REJECT, REJECTED,
                TRANSFER, TRANSFERRED,
                RESCHEDULE, PENDING,
                OVERDUE_TICK, OVERDUE
        ));

        // in_progress: 完成 / 转介
        t.put(IN_PROGRESS, Map.of(
                RESOLVE, RESOLVED,
                TRANSFER, TRANSFERRED
        ));

        // overdue: 接单（逾期接）/ 直接完成 / 转介
        t.put(OVERDUE, Map.of(
                ACCEPT, ACCEPTED,
                RESOLVE, RESOLVED,
                TRANSFER, TRANSFERRED
        ));

        // 终态：resolved / rejected / transferred 不再迁移
        t.put(RESOLVED, Map.of());
        t.put(REJECTED, Map.of());
        t.put(TRANSFERRED, Map.of());

        TABLE = t;
    }

    private CareTaskTransitions() {}

    /**
     * 校验并返回目标状态。
     * @throws BizException CARE_TASK_INVALID_TRANSITION 当 (from, event) 不在允许表中
     */
    public static CareTaskStatus next(CareTaskStatus from, CareTaskEvent event) {
        Map<CareTaskEvent, CareTaskStatus> allowed = TABLE.getOrDefault(from, Map.of());
        CareTaskStatus to = allowed.get(event);
        if (to == null) {
            throw new BizException(CareTaskErrorCode.CARE_TASK_INVALID_TRANSITION);
        }
        return to;
    }

    /** 仅校验是否允许，不抛异常 —— 用于 UI 决定按钮可见性场景。 */
    public static boolean isAllowed(CareTaskStatus from, CareTaskEvent event) {
        return TABLE.getOrDefault(from, Map.of()).containsKey(event);
    }
}
