package com.xg.business.checkin.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@TableName(value = "checkin_activity", autoResultMap = true)
public class CheckinActivity extends BaseEntity {

    @TableField("title")
    private String title;

    @TableField("creator_id")
    private Long creatorId;

    /**
     * BIGINT[] stored as String
     */
    @TableField("scope_org_ids")
    private String scopeOrgIds;

    @TableField("expected_count")
    private Integer expectedCount;

    @TableField("checkin_mode")
    private String checkinMode;

    @TableField("qr_code_secret")
    private String qrCodeSecret;

    @TableField("qr_refresh_interval")
    private Integer qrRefreshInterval;

    @TableField("late_threshold_minutes")
    private Integer lateThresholdMinutes;

    @TableField("start_time")
    private OffsetDateTime startTime;

    @TableField("end_time")
    private OffsetDateTime endTime;

    @TableField("enable_checkout")
    private Boolean enableCheckout;

    @TableField("checkout_end_time")
    private OffsetDateTime checkoutEndTime;

    @TableField("status")
    private String status;

    /**
     * JSONB stored as String
     */
    @TableField(value = "geo_fence", typeHandler = JsonbTypeHandler.class)
    private String geoFence;
}
