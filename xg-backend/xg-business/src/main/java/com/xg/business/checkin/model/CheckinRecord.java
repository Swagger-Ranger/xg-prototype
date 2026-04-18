package com.xg.business.checkin.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "checkin_record", autoResultMap = true)
public class CheckinRecord {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    @TableField("activity_id")
    private Long activityId;

    @TableField("student_id")
    private Long studentId;

    @TableField("status")
    private String status;

    @TableField("checked_in_at")
    private OffsetDateTime checkedInAt;

    @TableField("checked_out_at")
    private OffsetDateTime checkedOutAt;

    @TableField("source")
    private String source;

    /**
     * JSONB stored as String
     */
    @TableField(value = "location", typeHandler = JsonbTypeHandler.class)
    private String location;

    @TableField("operator_id")
    private Long operatorId;

    @TableField("note")
    private String note;

    @TableField("created_at")
    private OffsetDateTime createdAt;
}
