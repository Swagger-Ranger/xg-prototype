package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯单测：学生侧四桶映射与文案（PRD §13.3 合规红线）。 */
class CareStudentCategoryTest {

    @Test
    void maps_internal_categories_to_four_buckets() {
        assertThat(CareStudentCategory.label("学业")).isEqualTo("学业");
        assertThat(CareStudentCategory.label("行为")).isEqualTo("行为");
        assertThat(CareStudentCategory.label("生活")).isEqualTo("生活");
        assertThat(CareStudentCategory.label("勤工")).isEqualTo("勤工助学");
    }

    @Test
    void cross_category_folds_into_life_not_exposing_internal_term() {
        // "跨类"是内部分类术语，学生端不得见，折叠进白名单桶
        assertThat(CareStudentCategory.label("跨类")).isEqualTo("生活");
    }

    @Test
    void unknown_or_null_falls_back_to_life() {
        assertThat(CareStudentCategory.label("某新类")).isEqualTo("生活");
        assertThat(CareStudentCategory.label(null)).isEqualTo("生活");
    }

    @Test
    void message_uses_prd_sentence_without_score_or_name() {
        String msg = CareStudentCategory.message("学业", 1);
        assertThat(msg).isEqualTo("你当前有 1 项学业类的主动关心，老师可能近期联系你");
        assertThat(msg).doesNotContain("分", "排名", "规则");
    }

    @Test
    void empty_message_constant() {
        assertThat(CareStudentCategory.EMPTY_MESSAGE).isEqualTo("目前无主动关心记录");
    }
}
