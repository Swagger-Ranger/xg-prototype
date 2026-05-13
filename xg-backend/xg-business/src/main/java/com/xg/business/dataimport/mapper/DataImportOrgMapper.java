package com.xg.business.dataimport.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * org_unit 只读查询，供导入向导推断/比对组织结构使用。
 * 多租户由 MyBatis-Plus 插件自动拼 tenant_id 谓词。
 */
@Mapper
public interface DataImportOrgMapper {

    /**
     * 列出当前租户下学籍线相关的 org 节点（学院 / 专业 / 班级），
     * 用于在内存里做名字匹配。track 限学籍线避免和书院树混。
     */
    @Select("""
            SELECT id, parent_id, name, type
              FROM org_unit
             WHERE type IN ('college', 'major', 'class')
               AND status = 'active'
               AND deleted_at IS NULL
               AND (track IS NULL OR track = 'academic')
             ORDER BY type, parent_id NULLS FIRST, sort_order, id
            """)
    List<Map<String, Object>> listAcademicOrgs();

    /**
     * 列出当前租户的机关部门 + 学院（辅导员导入"从属单位"要匹配的候选）。
     */
    @Select("""
            SELECT id, parent_id, name, type
              FROM org_unit
             WHERE type IN ('college', 'admin_dept')
               AND status = 'active'
               AND deleted_at IS NULL
            """)
    List<Map<String, Object>> listAdminAndCollege();
}
