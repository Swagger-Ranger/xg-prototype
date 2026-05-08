package com.xg.platform.workflow.catalog;

import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * Per-tenant catalog entry for a known form field. The JSONB array columns
 * (aliases / options / used_in_flows) are intentionally not mapped on the
 * entity — they're updated via raw SQL in {@link FieldCatalogService} where
 * we can use jsonb operators directly without a custom type handler.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("field_catalog")
public class FieldCatalogEntry extends BaseEntity {

    private String name;
    private String label;
    private String type;
    private String description;

    private Boolean canonical;
    private Integer usageCount;
    private String category;

    private Boolean required;
    private String placeholder;
    private String pattern;

    private BigDecimal minValue;
    private BigDecimal maxValue;
    private Integer minLength;
    private Integer maxLength;

    private String targetTable;
    private String targetPath;
    private String writeStrategy;
    private String sensitivity;
    private String indexStrategy;

    private Boolean deprecated;
}
