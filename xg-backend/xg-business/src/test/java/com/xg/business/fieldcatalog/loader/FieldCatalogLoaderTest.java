package com.xg.business.fieldcatalog.loader;

import com.xg.business.fieldcatalog.model.FieldCatalog;
import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 student.yaml 能被加载,且 9 个现有 filter 都能映射到 FieldDef record。
 * 重点是几条容易翻车的边角:@JsonProperty("static")、嵌套 record、可空字段。
 */
class FieldCatalogLoaderTest {

    @Test
    void loadsStudentCatalog() {
        // FieldCatalogLoader 重构后自带内部 YAML_MAPPER(已 findAndRegisterModules),不再注入 ObjectMapper。
        FieldCatalogLoader loader = new FieldCatalogLoader();
        loader.load();   // 同包,直接调 package-private 方法

        Map<String, FieldCatalog> all = loader.getAll();
        assertThat(all).containsKey("student");

        FieldCatalog student = all.get("student");
        assertThat(student.fields()).hasSize(9);

        Map<String, FieldDef> byKey = student.fields().stream()
                .collect(java.util.stream.Collectors.toMap(FieldDef::key, f -> f));

        // text + ilike_multi
        assertThat(byKey.get("keyword").type()).isEqualTo("text");
        assertThat(byKey.get("keyword").sql().strategy()).isEqualTo("ilike_multi");
        assertThat(byKey.get("keyword").sql().columns()).containsExactly("u.real_name", "sp.student_no", "u.phone");

        // simple_eq + 静态枚举 + AI 别名
        FieldDef gender = byKey.get("gender");
        assertThat(gender.sql().column()).isEqualTo("u.gender");
        assertThat(gender.options().staticOptions()).hasSize(2);
        assertThat(gender.options().staticOptions().get(0).value()).isEqualTo("male");
        assertThat(gender.aliases()).extracting("phrase").containsExactly("男生", "女生");

        // 静态枚举:年级 5 项
        assertThat(byKey.get("grade").options().staticOptions()).hasSize(5);
        assertThat(byKey.get("grade").options().staticOptions().get(0).value()).isEqualTo("2021级");

        // 学院 静态枚举 5 项
        assertThat(byKey.get("college").options().staticOptions()).hasSize(5);

        // 专业 cascadingStatic:5 个学院 group + parentKey=college
        FieldDef major = byKey.get("major");
        assertThat(major.parent()).isEqualTo("college");
        assertThat(major.options().cascadingStatic().parentKey()).isEqualTo("college");
        assertThat(major.options().cascadingStatic().groups()).containsKeys(
                "计算机学院", "人文学院", "经济管理学院", "机械工程学院", "艺术学院");
        assertThat(major.options().cascadingStatic().groups().get("计算机学院"))
                .containsExactly("软件工程", "计算机科学与技术", "数据科学与大数据技术", "人工智能");

        // className 走 endpoint url
        assertThat(byKey.get("className").options().dynamic().url()).isEqualTo("/student-classes");
        assertThat(byKey.get("className").options().dynamic().scopedBy()).containsExactly("college", "major");

        // residential_subquery + 双轨制门控
        FieldDef academy = byKey.get("academy");
        assertThat(academy.sql().strategy()).isEqualTo("residential_subquery");
        assertThat(academy.sql().residentialType()).isEqualTo("academy");
        assertThat(academy.visibility().tenantSetting()).isEqualTo("enable_residential_track");
        assertThat(academy.options().dynamic().url()).isEqualTo("/student-residential-options");

        FieldDef dormBlock = byKey.get("dormBlock");
        assertThat(dormBlock.sql().residentialType()).isEqualTo("dorm_block");
        assertThat(dormBlock.parent()).isEqualTo("academy");

        // 学籍状态 静态枚举 4 项
        assertThat(byKey.get("status").options().staticOptions()).hasSize(4);
    }
}
