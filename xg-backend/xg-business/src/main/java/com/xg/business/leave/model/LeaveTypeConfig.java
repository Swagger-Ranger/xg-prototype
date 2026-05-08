package com.xg.business.leave.model;

import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

/**
 * Leave-type view model. Used as a return shape for API and as the input shape
 * to {@link com.xg.business.leave.service.LeaveTypeFieldTranslator}. After V076
 * this is no longer bound to a table — data flows through
 * {@link com.xg.business.leave.service.LeaveConfigBaseService} which materialises
 * instances from {@code leave_config_base.config.leaveTypes}.
 *
 * <p>{@link BaseEntity} is kept as the parent so the JSON shape returned by
 * {@code /api/v1/leave-types} stays backward compatible with the frontend
 * (id/tenantId/createdAt/... will simply be null). The {@code @TableName} /
 * {@code @TableField} annotations have been removed because the legacy
 * {@code leave_type_config} table is no longer the source of truth.
 */
@Getter
@Setter
public class LeaveTypeConfig extends BaseEntity {

    private String code;
    private String name;
    private String parentCode;
    /** JSON array string: legacy {@code [{field_key, field_label, field_type, ...}]} shape. */
    private String extraFields;
    private Boolean requireAttachment;
    /** 单次请假天数上限(防一次请太多)。NULL=不限。 */
    private Integer maxDays;
    /** 本学期累计请假上限(天数,可半天)。NULL=不限。 */
    private java.math.BigDecimal termMaxDays;
    private Boolean enabled;
    private Integer sortOrder;
}
