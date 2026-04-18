package com.xg.platform.event.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.Map;

@Getter
@Setter
@TableName(value = "student_event_log", autoResultMap = true)
public class StudentEventLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("student_id")
    private Long studentId;

    @TableField("event_type")
    private String eventType;

    @TableField("event_source")
    private String eventSource;

    @TableField(value = "event_data", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> eventData;

    @TableField("occurred_at")
    private OffsetDateTime occurredAt;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
