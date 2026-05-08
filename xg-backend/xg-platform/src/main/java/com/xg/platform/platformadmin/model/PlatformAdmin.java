package com.xg.platform.platformadmin.model;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Platform-level super admin. Lives in public.platform_admin and is not tied
 * to any tenant — does NOT extend BaseEntity (no tenant_id, no deleted_at).
 */
@Getter
@Setter
@TableName("platform_admin")
public class PlatformAdmin {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("username")
    private String username;

    @TableField("password_hash")
    private String passwordHash;

    @TableField("real_name")
    private String realName;

    @TableField("phone")
    private String phone;

    @TableField("email")
    private String email;

    /** active / disabled */
    @TableField("status")
    private String status;

    @TableField("last_login_at")
    private OffsetDateTime lastLoginAt;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
