package com.xg.business.leave.mapper;

import com.xg.business.leave.model.LeaveTypeConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Phase D 后:假别元信息直接读 {@code leave_type_config} 表,不再走
 * {@code leave_config_base} JSONB。所有原 LeaveConfigBaseService 的 read
 * 方法都迁来这里。
 *
 * <p>{@code leave_type_config.extra_fields} 是 jsonb 但语义上是 array
 * (每条字段一个 dict),mapper 直接当 string 取出,Service 层按 array JSON
 * 处理。
 */
@Mapper
public interface LeaveTypeConfigMapper {

    @Results({
            @Result(column = "code", property = "code"),
            @Result(column = "name", property = "name"),
            @Result(column = "parent_code", property = "parentCode"),
            @Result(column = "extra_fields", property = "extraFields"),
            @Result(column = "require_attachment", property = "requireAttachment"),
            @Result(column = "max_days", property = "maxDays"),
            @Result(column = "term_max_days", property = "termMaxDays"),
            @Result(column = "enabled", property = "enabled"),
            @Result(column = "sort_order", property = "sortOrder"),
    })
    @Select("""
            SELECT code, name, parent_code, extra_fields::text AS extra_fields,
                   require_attachment, max_days, term_max_days, enabled, sort_order
              FROM leave_type_config
             WHERE deleted_at IS NULL
             ORDER BY sort_order NULLS LAST, id
            """)
    List<LeaveTypeConfig> listAll();

    @Results({
            @Result(column = "code", property = "code"),
            @Result(column = "name", property = "name"),
            @Result(column = "parent_code", property = "parentCode"),
            @Result(column = "extra_fields", property = "extraFields"),
            @Result(column = "require_attachment", property = "requireAttachment"),
            @Result(column = "max_days", property = "maxDays"),
            @Result(column = "term_max_days", property = "termMaxDays"),
            @Result(column = "enabled", property = "enabled"),
            @Result(column = "sort_order", property = "sortOrder"),
    })
    @Select("""
            SELECT code, name, parent_code, extra_fields::text AS extra_fields,
                   require_attachment, max_days, term_max_days, enabled, sort_order
              FROM leave_type_config
             WHERE code = #{code} AND deleted_at IS NULL
             LIMIT 1
            """)
    LeaveTypeConfig findByCode(@Param("code") String code);

    /** 改某假别的学期累计上限。null = 不限。 */
    @Update("""
            UPDATE leave_type_config
               SET term_max_days = #{termMaxDays},
                   updated_at = NOW(),
                   updated_by = #{operatorId}
             WHERE code = #{code} AND deleted_at IS NULL
            """)
    int updateTermMaxDays(@Param("code") String code,
                          @Param("termMaxDays") java.math.BigDecimal termMaxDays,
                          @Param("operatorId") Long operatorId);

    /** 改某假别的 extraFields(legacy array JSON)。返回受影响行数。 */
    @Update("""
            UPDATE leave_type_config
               SET extra_fields = #{extraFields}::jsonb,
                   updated_at = NOW(),
                   updated_by = #{operatorId}
             WHERE code = #{code} AND deleted_at IS NULL
            """)
    int updateExtraFields(@Param("code") String code,
                          @Param("extraFields") String extraFieldsArrayJson,
                          @Param("operatorId") Long operatorId);

    /**
     * 兜底插入新假别。当 AI 助手在 workflow YAML 里加一个 type_router 分支但
     * leave_type_config 表里没有对应行时,WorkflowConfigEditService 调本方法
     * 同步一行,name 暂用 code 回退,后续老师可以编辑改成中文。
     * id 由 IdWorker 雪花生成传入。ON CONFLICT 走 (tenant_id, code)。
     */
    @org.apache.ibatis.annotations.Insert("""
            INSERT INTO leave_type_config
                (id, tenant_id, code, name, max_days, require_attachment, enabled, sort_order, extra_fields, created_at)
            VALUES
                (#{id}, #{tenantId}, #{code}, #{name}, NULL, FALSE, TRUE,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM leave_type_config WHERE tenant_id = #{tenantId}),
                 '[]'::jsonb, NOW())
            ON CONFLICT (tenant_id, code) DO UPDATE
               SET deleted_at = NULL, updated_at = NOW()
            """)
    int upsertNew(@org.apache.ibatis.annotations.Param("id") Long id,
                  @org.apache.ibatis.annotations.Param("tenantId") String tenantId,
                  @org.apache.ibatis.annotations.Param("code") String code,
                  @org.apache.ibatis.annotations.Param("name") String name);
}
