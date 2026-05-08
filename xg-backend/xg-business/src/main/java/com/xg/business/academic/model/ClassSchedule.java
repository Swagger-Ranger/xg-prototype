package com.xg.business.academic.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonRawValue;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 班级课表 (one row per class × term). {@code entries} is a JSONB array
 * holding course rows (course_name / teacher / location / day_of_week /
 * start_period / end_period / weeks / color). Stored as a raw String so the
 * payload can be passed through to the front-end without re-serialisation.
 */
@Getter
@Setter
@TableName(value = "class_schedule", autoResultMap = true)
public class ClassSchedule {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("class_id")
    private Long classId;

    @TableField("term_code")
    private String termCode;

    /** 'manual' / 'edu_admin_sync' / 'imported_xxx'. */
    @TableField("source")
    private String source;

    /** Set by ClassScheduleSyncScheduler each daily run. NULL = never synced. */
    @TableField("last_synced_at")
    private OffsetDateTime lastSyncedAt;

    @TableField("imported_by")
    private Long importedBy;

    /** JSONB stored as raw String — see {@link #getEntries()}. */
    @Getter(AccessLevel.NONE)
    @TableField(value = "entries", typeHandler = JsonbTypeHandler.class)
    private String entries;

    @JsonRawValue
    public String getEntries() {
        return (entries == null || entries.isEmpty()) ? "[]" : entries;
    }

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
