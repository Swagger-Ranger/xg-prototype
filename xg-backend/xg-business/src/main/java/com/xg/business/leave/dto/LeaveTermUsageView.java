package com.xg.business.leave.dto;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * GET /api/v1/leaves/term-usage 返回结构。学生申请页 / 辅导员审批 drawer
 * 都拉这个判断要不要红条提示「本学期已累计 X 天,超过上限 Y 天」。
 *
 * <p>语义:
 * <ul>
 *   <li>capDays = null → 没设上限,前端不渲染提示</li>
 *   <li>无 is_current 学期 → termName=null + 其它 0,前端按 capDays 判空</li>
 *   <li>exceeded = (capDays != null && accumulatedDays > capDays)</li>
 * </ul>
 */
@Getter
@Setter
public class LeaveTermUsageView {
    /** 当前学期名称,如「2025-2026 学年第二学期」;无 is_current 时为 null。 */
    private String termName;
    /** 该学生本学期已批/审中假别(全部假别求和)的累计天数。 */
    private BigDecimal accumulatedDays;
    /** 全局学期累计上限。null = 不限。 */
    private BigDecimal capDays;
    /** accumulated > cap。capDays==null 时永远 false。 */
    private boolean exceeded;
}
