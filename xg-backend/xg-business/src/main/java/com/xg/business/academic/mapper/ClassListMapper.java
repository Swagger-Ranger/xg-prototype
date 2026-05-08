package com.xg.business.academic.mapper;

import com.xg.business.academic.dto.ClassRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Read-only listing of org_unit rows where type='class', joined to their
 * parent unit (typically 学院) for display. Used by the class-schedule admin
 * editor's picker — adding a full OrgUnit CRUD module would be overkill since
 * org structure is seeded today.
 *
 * Tenant scoping is handled by TenantSchemaInterceptor (SET search_path).
 */
@Mapper
public interface ClassListMapper {

    @Select({
            "SELECT c.id AS id,",
            "       c.name AS name,",
            "       p.name AS parent_name",
            "FROM org_unit c",
            "LEFT JOIN org_unit p ON p.id = c.parent_id",
            "WHERE c.type = 'class'",
            "  AND c.status = 'active'",
            "ORDER BY c.sort_order, c.name"
    })
    List<ClassRow> listClasses();
}
