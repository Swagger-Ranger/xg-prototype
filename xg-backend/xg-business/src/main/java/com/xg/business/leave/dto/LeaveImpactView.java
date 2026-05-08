package com.xg.business.leave.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 请假影响课程视图。展开形式：辅导员审批时点击"影响 N 节课"trigger
 * 即可看到逐日的课程列表。
 *
 * 计算口径（见 {@code LeaveImpactService}）：
 *   · 仅在班级当前学期已有 class_schedule 时给出非零结果；
 *     无课表 / 跨学期 / 学籍异常 时返回 zero（不抛错，UI 显示"无可分析"即可）
 *   · 周末和无课时段不计入"耽误的课"——day_of_week 必须命中 schedule entry
 *     且周次落在 entry.weeks 数组里
 *   · 同一节课如果跨多日重复（如周一周三都有高数）会按"实际节次"展开
 */
@Data
public class LeaveImpactView {

    /** 受影响的总节次（period 数量），非课程门数。 */
    private int totalPeriods;

    /** 不重复的课程门数（按 course_name 去重）。 */
    private int totalCourses;

    /** 受影响的天数（即 byDay.size()，方便 UI 直接展示"3 天"）。 */
    private int totalDays;

    /** 当前学期 code；无对应学期时为空，UI 用作空态判断。 */
    private String termCode;

    /** 每日明细，按 date 升序。无课的日子不出现在列表里。 */
    private List<DayImpact> byDay = new ArrayList<>();

    @Data
    public static class DayImpact {
        private LocalDate date;
        /** ISO day-of-week: 1=Mon ... 7=Sun. */
        private int dayOfWeek;
        /** 教学周（相对 term.start_date 的第 N 周，1-based）。 */
        private int week;
        private List<CourseSlot> courses = new ArrayList<>();
    }

    @Data
    public static class CourseSlot {
        private String courseName;
        private String teacher;
        private String location;
        private int startPeriod;
        private int endPeriod;
        /** schedule 里 entry 自带的 tone color，UI 直接用做色条。 */
        private String color;
    }
}
