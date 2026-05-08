package com.xg.platform.tenant.model;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Tenant registry entry (public.tenant). Not tied to any tenant — does NOT
 * extend BaseEntity. id is a string (assigned by caller, e.g. "demo", not a
 * snowflake) so we use IdType.INPUT.
 */
@Getter
@Setter
@TableName(value = "tenant", autoResultMap = true)
public class Tenant {

    @TableId(type = IdType.INPUT)
    private String id;

    @TableField("name")
    private String name;

    @TableField("code")
    private String code;

    @TableField("schema_name")
    private String schemaName;

    /** active / suspended / archived */
    @TableField("status")
    private String status;

    @TableField(value = "config", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> config;

    @TableField("contact_name")
    private String contactName;

    @TableField("contact_phone")
    private String contactPhone;

    @TableField("contact_email")
    private String contactEmail;

    @TableField("max_users")
    private Integer maxUsers;
    // school_city is intentionally NOT mapped here — it's accessed via the
    // dedicated TenantSettingsService over JdbcTemplate, with a try-catch
    // fallback if the V006 migration hasn't been applied yet. Mapping it
    // on the entity would make every selectById fail with "column does not
    // exist" until the migration runs.

    @TableField("expired_at")
    private OffsetDateTime expiredAt;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
