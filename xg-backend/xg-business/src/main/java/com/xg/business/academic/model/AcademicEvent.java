package com.xg.business.academic.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * 学历事件 (考试 / 假期 / 其它时间节点). Feeds "距期末考 X 天" countdowns
 * and welcome-strip subtitles. {@code granularity = 'month'} stores month
 * boundaries in start/end and the UI renders "X 月（具体日期待定）"; flip
 * to 'day' once exact dates are confirmed.
 */
@Getter
@Setter
@TableName(value = "academic_event", autoResultMap = true)
public class AcademicEvent {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    /** Optional — winter / summer breaks may straddle terms. */
    @TableField("term_code")
    private String termCode;

    /** 'exam_midterm' / 'exam_final' / 'holiday' / 'other'. */
    @TableField("event_type")
    private String eventType;

    @TableField("name")
    private String name;

    @TableField("start_date")
    private LocalDate startDate;

    @TableField("end_date")
    private LocalDate endDate;

    /** 'day' / 'month'. */
    @TableField("granularity")
    private String granularity;

    @TableField("notes")
    private String notes;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
