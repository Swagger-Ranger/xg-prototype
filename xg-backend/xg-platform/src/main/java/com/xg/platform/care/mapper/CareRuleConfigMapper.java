package com.xg.platform.care.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 规则运维覆盖表读写（PRD §6.3）。care_rule_config / care_rule_setting 都是
 * 复合/单例小表，沿用 care 模块"原生 SQL + Map 返回"风格（规避 BaseMapper
 * 复合主键摩擦）。所有语句显式带 tenant_id —— 跨租户串运维配置是安全事故。
 */
@Mapper
public interface CareRuleConfigMapper {

    /** 该租户被显式启停过的规则行（无行的规则默认启用）。 */
    @Select("SELECT rule_id, enabled FROM care_rule_config WHERE tenant_id = #{tenantId}")
    List<Map<String, Object>> listConfigs(@Param("tenantId") String tenantId);

    /** 启停 upsert：(tenant, rule) 已存在则覆盖 enabled。 */
    @Insert("""
            INSERT INTO care_rule_config (tenant_id, rule_id, enabled, updated_by, updated_at)
            VALUES (#{tenantId}, #{ruleId}, #{enabled}, #{updatedBy}, NOW())
            ON CONFLICT (tenant_id, rule_id)
            DO UPDATE SET enabled = EXCLUDED.enabled,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = NOW()
            """)
    int upsertEnabled(@Param("tenantId") String tenantId,
                      @Param("ruleId") String ruleId,
                      @Param("enabled") boolean enabled,
                      @Param("updatedBy") Long updatedBy);

    /** 当前租户全局严重度偏移；无行返回 null（service 兜底 0）。 */
    @Select("SELECT severity_offset FROM care_rule_setting WHERE tenant_id = #{tenantId}")
    Integer findSeverityOffset(@Param("tenantId") String tenantId);

    /** 全局严重度偏移 upsert（单行）。 */
    @Insert("""
            INSERT INTO care_rule_setting (tenant_id, severity_offset, updated_by, updated_at)
            VALUES (#{tenantId}, #{offset}, #{updatedBy}, NOW())
            ON CONFLICT (tenant_id)
            DO UPDATE SET severity_offset = EXCLUDED.severity_offset,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = NOW()
            """)
    int upsertSeverityOffset(@Param("tenantId") String tenantId,
                             @Param("offset") int offset,
                             @Param("updatedBy") Long updatedBy);
}
