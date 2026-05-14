package com.xg.business.dataimport.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.mybatis.JsonbMapTypeHandler;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
@TableName(value = "data_import_session", autoResultMap = true)
public class DataImportSession extends BaseEntity {

    @TableField("importer_id")
    private Long importerId;

    /** student / teacher / counselor */
    @TableField("scenario")
    private String scenario;

    /** created / parsed / mapped / org_previewed / validated / executing / executed / failed */
    @TableField("status")
    private String status;

    @TableField("file_name")
    private String fileName;

    @TableField("total_rows")
    private Integer totalRows;

    @TableField("intent_text")
    private String intentText;

    /** { headers: [...], samples: [[...], [...]], rows: [[...], ...] } */
    @TableField(value = "parsed_payload", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> parsedPayload;

    /** { mappings: [{source_col, target, confidence, source}, ...] } */
    @TableField(value = "column_mapping", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> columnMapping;

    @TableField("mapping_intent")
    private String mappingIntent;

    @TableField(value = "org_preview", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> orgPreview;

    @TableField(value = "validation_report", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> validationReport;

    @TableField(value = "strategy", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> strategy;

    @TableField(value = "result_summary", typeHandler = JsonbMapTypeHandler.class)
    private Map<String, Object> resultSummary;

    @TableField("error_message")
    private String errorMessage;
}
