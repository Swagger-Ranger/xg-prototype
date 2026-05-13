package com.xg.business.leave.dto;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

/**
 * GET /api/v1/leaves/term-usage 返回结构。学生申请页 / 辅导员审批 drawer
 * 都拉这个,常驻展示「本学期累计 X 天」+ 按假别拆分 + 近 30 天频次,
 * exceeded 时再叠一层红条软警告(不阻断提交)。
 *
 * <p>语义:
 * <ul>
 *   <li>capDays = null → 没设上限,前端不渲染红条但仍渲染累计卡片</li>
 *   <li>无 is_current 学期 → termName=null + 其它 0,前端按 capDays 判空</li>
 *   <li>exceeded = (capDays != null && accumulatedDays > capDays)</li>
 *   <li>byType:按 leave_type_code 聚合,顺序按 days 倒序</li>
 *   <li>recentCount30d:近 30 天 status∈{pending,approved} 请假条数,辅助判断异常频次</li>
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
    /** 按假别拆分的累计;空数组表示本学期未请过假。 */
    private List<TypeUsage> byType;
    /** 近 30 天 status∈{pending,approved} 的请假条数(不限学期口径,跨学期也算)。 */
    private int recentCount30d;

    @Getter
    @Setter
    public static class TypeUsage {
        private String code;
        private String name;
        private BigDecimal days;
    }
}
