package com.xg.business.fieldcatalog.sql;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.fieldcatalog.loader.FieldCatalogLoader;
import com.xg.business.fieldcatalog.model.FieldCatalog;
import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import com.xg.business.fieldcatalog.model.FieldCatalog.SqlConfig;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 三个 strategy + SqlBuilder 行为校验。重点:
 *   - simple_eq / ilike_multi / residential_subquery 各自的 SQL 输出形状
 *   - SqlBuilder 跳过 null/空字符串、按 catalog 顺序拼 AND、绑定 Map 只含传入值
 *   - SqlIdentifiers 拦截非法列名
 *   - 用 student.yaml 真实跑一遍,确保现有 9 个 filter 全过得了
 */
class SqlBuilderTest {

    private final SqlBuilder builder = new SqlBuilder(List.of(
            new SimpleEqStrategy(),
            new IlikeMultiStrategy(),
            new ResidentialSubqueryStrategy()
    ));

    @Test
    void simpleEq_outputs_columnEquals() {
        FieldDef gender = field("gender", new SqlConfig("simple_eq", "u.gender", null, null, null));
        SqlBuilder.Built b = builder.build(List.of(gender), Map.of("gender", "male"));
        assertThat(b.where()).isEqualTo(" AND u.gender = #{filters.gender}");
        assertThat(b.bind()).containsExactly(Map.entry("gender", "male"));
    }

    @Test
    void ilikeMulti_orsAllColumns() {
        FieldDef kw = field("keyword",
                new SqlConfig("ilike_multi", null, List.of("u.real_name", "sp.student_no"), null, null));
        SqlBuilder.Built b = builder.build(List.of(kw), Map.of("keyword", "张"));
        assertThat(b.where()).isEqualTo(
                " AND (u.real_name ILIKE CONCAT('%', #{filters.keyword}, '%') "
                + "OR sp.student_no ILIKE CONCAT('%', #{filters.keyword}, '%'))");
    }

    @Test
    void residentialSubquery_inlinesType_bindsName() {
        FieldDef academy = field("academy", new SqlConfig("residential_subquery", null, null, "academy", null));
        SqlBuilder.Built b = builder.build(List.of(academy), Map.of("academy", "博雅书院"));
        assertThat(b.where()).contains("ou.type = 'academy'");
        assertThat(b.where()).contains("ou.name = #{filters.academy}");
        assertThat(b.bind()).containsEntry("academy", "博雅书院");
    }

    @Test
    void residentialSubquery_rejectsUnknownType() {
        FieldDef bad = field("x", new SqlConfig("residential_subquery", null, null, "DROP_TABLE", null));
        assertThatThrownBy(() -> builder.build(List.of(bad), Map.of("x", "v")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("academy 或 dorm_block");
    }

    @Test
    void simpleEq_rejectsInvalidColumn() {
        FieldDef bad = field("x", new SqlConfig("simple_eq", "u.gender; DROP TABLE", null, null, null));
        assertThatThrownBy(() -> builder.build(List.of(bad), Map.of("x", "v")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("simple_eq.column");
    }

    @Test
    void skips_null_and_blank_values() {
        FieldDef gender = field("gender", new SqlConfig("simple_eq", "u.gender", null, null, null));
        FieldDef status = field("status", new SqlConfig("simple_eq", "sp.status", null, null, null));
        Map<String, Object> raw = new HashMap<>();
        raw.put("gender", null);
        raw.put("status", "");
        SqlBuilder.Built b = builder.build(List.of(gender, status), raw);
        assertThat(b.where()).isEmpty();
        assertThat(b.bind()).isEmpty();
    }

    @Test
    void unknownStrategy_throws() {
        FieldDef bad = field("x", new SqlConfig("not_a_real_strategy", "u.x", null, null, null));
        assertThatThrownBy(() -> builder.build(List.of(bad), Map.of("x", "v")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("未知 strategy");
    }

    @Test
    void integratesWith_realStudentYaml() {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        FieldCatalogLoader loader = new FieldCatalogLoader(mapper);
        loader.load();
        FieldCatalog student = loader.getAll().get("student");

        // 同时打开 keyword + gender + academy:三种 strategy 联用,顺序按 yaml 声明
        SqlBuilder.Built b = builder.build(
                student.fields(),
                Map.of("keyword", "张", "gender", "male", "academy", "博雅书院"));

        assertThat(b.where())
                .contains("u.real_name ILIKE")
                .contains("u.gender = #{filters.gender}")
                .contains("ou.type = 'academy'");
        assertThat(b.bind())
                .containsKeys("keyword", "gender", "academy")
                .doesNotContainKeys("status", "grade", "college", "major", "className", "dormBlock");
    }

    private static FieldDef field(String key, SqlConfig sql) {
        return new FieldDef(key, key, null, "enum", sql, null, null, null, null);
    }
}
