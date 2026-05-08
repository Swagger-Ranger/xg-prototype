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
 * 学期 (academic term). Drives 学期进度环、当前周次、距期末考天数 etc on
 * the campus dashboard. Class schedules + academic events both reference
 * this table by {@link #code}.
 */
@Getter
@Setter
@TableName(value = "academic_term", autoResultMap = true)
public class AcademicTerm {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField(value = "tenant_id")
    private String tenantId;

    /** "2025-2026-1" / "2025-2026-2". Stable handle used by other tables. */
    @TableField("code")
    private String code;

    @TableField("name")
    private String name;

    @TableField("start_date")
    private LocalDate startDate;

    @TableField("end_date")
    private LocalDate endDate;

    @TableField("total_weeks")
    private Integer totalWeeks;

    /** Exactly one row per tenant has is_current=TRUE (enforced by partial unique index). */
    @TableField("is_current")
    private Boolean isCurrent;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    @TableField("updated_at")
    private OffsetDateTime updatedAt;
}
