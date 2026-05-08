package com.xg.platform.alert.catalog;

import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AlertFieldCatalog {

    public record Field(String path, String type, String description) {}

    private static final Map<AlertDimension, List<Field>> FIELDS = Map.ofEntries(
            Map.entry(AlertDimension.LEAVE, List.of(
                    new Field("event_data.leave_type", "string", "请假类型代码 (sick/personal/...)"),
                    new Field("event_data.duration_days", "number", "请假天数"),
                    new Field("event_data.leave_request_id", "number", "请假单 ID")
            )),
            Map.entry(AlertDimension.CHECKIN_LATE, List.of(
                    new Field("event_data.late_minutes", "number", "迟到分钟数"),
                    new Field("event_data.activity_id", "number", "考勤活动 ID"),
                    new Field("event_data.activity_name", "string", "活动名称")
            )),
            Map.entry(AlertDimension.ABSENCE, List.of(
                    new Field("event_data.activity_id", "number", "考勤活动 ID（内部缺勤）"),
                    new Field("event_data.course_id", "number", "课程 ID（外部旷课）"),
                    new Field("event_data.course_name", "string", "课程名称")
            )),
            Map.entry(AlertDimension.VIOLATION, List.of(
                    new Field("event_data.violation_type", "string", "违纪类别"),
                    new Field("event_data.violation_id", "number", "违纪记录 ID")
            )),
            Map.entry(AlertDimension.DORM_CHECK, List.of(
                    new Field("event_data.check_time", "string", "查寝时间点"),
                    new Field("event_data.dorm_id", "number", "宿舍 ID")
            )),
            Map.entry(AlertDimension.AI_CHAT, List.of(
                    new Field("event_data.topic", "string", "AI 打标的话题"),
                    new Field("event_data.sentiment", "number", "情绪倾向 -1~1"),
                    new Field("event_data.snippet", "string", "脱敏后片段 (<=200 字)")
            )),
            Map.entry(AlertDimension.CONSUMPTION, List.of(
                    new Field("event_data.scene", "string", "消费场景 (canteen/supermarket/...)"),
                    new Field("event_data.amount", "number", "金额（元）")
            )),
            Map.entry(AlertDimension.EXAM_FAIL, List.of(
                    new Field("event_data.course_id", "number", "课程 ID"),
                    new Field("event_data.score", "number", "分数"),
                    new Field("event_data.semester", "string", "学期标识")
            ))
    );

    private static final Set<String> COMMON_FIELDS = Set.of(
            "event_type", "severity", "occurred_at", "event_source"
    );

    private AlertFieldCatalog() {}

    public static List<Field> fieldsOf(AlertDimension d) {
        return FIELDS.getOrDefault(d, List.of());
    }

    public static boolean hasField(AlertDimension d, String path) {
        if (path == null) return false;
        if (COMMON_FIELDS.contains(path)) return true;
        return fieldsOf(d).stream().anyMatch(f -> f.path().equals(path));
    }

    public static Map<AlertDimension, List<Field>> all() {
        return FIELDS;
    }
}
