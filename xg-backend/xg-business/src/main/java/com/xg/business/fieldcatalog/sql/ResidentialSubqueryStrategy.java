package com.xg.business.fieldcatalog.sql;

import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * 双轨制 filter:学生 ⨯ 书院/楼栋 是 student_org_membership 多对多。EXISTS 子查询比 JOIN 干净,
 * 不会引入 distinct。residentialType 来自 yaml,严格白名单 (academy / dorm_block) 后才能拼进 SQL。
 *
 * 注意:这个 strategy 强耦合学生页主表别名 sp.user_id。其他页面要复用先评估,大概率得新增 strategy。
 */
@Component
public class ResidentialSubqueryStrategy implements SqlStrategy {

    private static final Set<String> ALLOWED_TYPES = Set.of("academy", "dorm_block");

    @Override
    public String name() { return "residential_subquery"; }

    @Override
    public String fragment(FieldDef field, String paramRef) {
        String type = field.sql().residentialType();
        if (!ALLOWED_TYPES.contains(type)) {
            throw new IllegalArgumentException("residential_subquery.residentialType 必须是 academy 或 dorm_block,实际:" + type);
        }
        // 学生只直接挂在 leaf (dorm_block) 上;按"书院"(academy)筛要走 closure 跨级 ancestor,
        // 按"书院班"(dorm_block)筛直接 join membership.org_unit_id 即可。
        if ("academy".equals(type)) {
            return "EXISTS (SELECT 1 FROM student_org_membership sm "
                 + "JOIN org_closure oc ON oc.descendant_id = sm.org_unit_id "
                 + "JOIN org_unit ou ON ou.id = oc.ancestor_id "
                 + "WHERE sm.student_user_id = sp.user_id AND ou.deleted_at IS NULL "
                 + "AND ou.track = 'residential' AND ou.type = 'academy' "
                 + "AND ou.name = #{" + paramRef + "})";
        }
        return "EXISTS (SELECT 1 FROM student_org_membership sm "
             + "JOIN org_unit ou ON ou.id = sm.org_unit_id "
             + "WHERE sm.student_user_id = sp.user_id AND ou.deleted_at IS NULL "
             + "AND ou.track = 'residential' AND ou.type = 'dorm_block' "
             + "AND ou.name = #{" + paramRef + "})";
    }
}
