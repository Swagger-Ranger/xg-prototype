package com.xg.platform.system.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "sys_user", autoResultMap = true)
public class SysUser extends BaseEntity {

    @TableField("username")
    private String username;

    @TableField("password_hash")
    private String passwordHash;

    @TableField("real_name")
    private String realName;

    @TableField("gender")
    private String gender;

    @TableField("phone")
    private String phone;

    @TableField("email")
    private String email;

    @TableField("avatar_url")
    private String avatarUrl;

    @TableField("external_id")
    private String externalId;

    @TableField("wechat_openid")
    private String wechatOpenid;

    @TableField("wecom_userid")
    private String wecomUserid;

    @TableField("status")
    private String status;

    @TableField("privacy_agreed")
    private Boolean privacyAgreed;

    @TableField("privacy_agreed_at")
    private OffsetDateTime privacyAgreedAt;

    @TableField("last_login_at")
    private OffsetDateTime lastLoginAt;
}
