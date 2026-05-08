"""Inline catalog snapshot that mirrors Java-side AlertDimension + AlertFieldCatalog.
Kept here (not fetched live) so the agent stays self-contained and deterministic.
If the Java catalog changes, update this file (paired with schema.json)."""

CATALOG_TEXT = """
维度 (dimension) → 事件类型 / 可选字段:
- leave          请假     event_types: leave_submit, leave_cancelled
                          fields: event_data.leave_type, event_data.duration_days
- checkin_late   迟到     event_types: checkin_late
                          fields: event_data.late_minutes, event_data.activity_id
- absence        旷课/缺勤 event_types: checkin_absent, absence_recorded
                          fields: event_data.course_id, event_data.course_name
- violation      违纪     event_types: violation_recorded
                          fields: event_data.violation_type
- dorm_check     查寝     event_types: dorm_check_absent, dorm_check_passed
                          fields: event_data.check_time, event_data.dorm_id
- ai_chat        AI问答   event_types: ai_chat_sensitive, ai_chat_normal
                          fields: event_data.topic, event_data.sentiment
- consumption    消费     event_types: consumption_recorded, consumption_anomaly
                          fields: event_data.scene, event_data.amount
- exam_fail      挂科     event_types: exam_failed
                          fields: event_data.course_id, event_data.score, event_data.semester

聚合算子 (op): count, sum, avg, max, min, distinct_days, consecutive_days, exists
  - sum/avg/max/min 必须配 field=event_data.<某个数值字段>
  - count/distinct_days/consecutive_days/exists 不需要 field
  - exists 的返回值是数值 1（有事件）或该学生不在结果里（无事件），**不是布尔**；
    condition 里用 `alias >= 1` 或直接 `alias`（不要用 `alias == true`）

可选 filter (aggregations.<alias>.filter)：用于在 dimension 之上**按 event_data 字段**进一步筛选事件。
  - **不要**用 filter 限制 event_type — dimension 已经自动按 event_types 过滤。
  - 语法: `event_data.<field> <op> <literal>`，多条件用 `AND` 连接
  - op: >, >=, <, <=, ==, !=, IN
  - IN 的列表用**方括号**: `event_data.course_id IN [101, 102]`（不是 SQL 圆括号）
  - 字符串字面量用单引号: `event_data.violation_type == 'fight'`
  - 例: `event_data.late_minutes > 30 AND event_data.activity_id IN [1, 2]`
  - 如果不需要额外筛选，**省略 filter 字段**，不要输出 filter: ""。

窗口 (window.type): rolling(days=N), calendar_month, calendar_week, semester
对比基准 (compare_to): previous_period, previous_month, previous_week
  - 设了 compare_to 后，condition 里可用 alias.current / alias.previous / alias.delta / alias.pct_change

severity 是 0-10 的整数。notify 可选值: counselor/parent/self。

condition 语法: 支持 AND / OR / NOT / 括号 / 比较 (>, >=, <, <=, ==, !=, IN)
  例: "late_cnt >= 3 AND violation_cnt >= 1"
  例: "absent_streak > 3 OR (score_avg.delta < -10 AND score_avg.previous > 80)"
""".strip()
