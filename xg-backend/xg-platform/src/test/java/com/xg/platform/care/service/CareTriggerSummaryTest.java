package com.xg.platform.care.service;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 纯单测：触发摘要服务端渲染（W1 §4.5 守门——前端不得见 rule_id）。
 * 措辞须与 CareRuleEngine.buildSummary / R008·R009 内联文案逐句一致。
 */
class CareTriggerSummaryTest {

    private static Map<String, Object> td(String ruleId, Object... kv) {
        Map<String, Object> m = new HashMap<>();
        m.put("rule_id", ruleId);
        m.put("rule_name", "占位名");
        m.put("window_days", 14);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @Test
    void count_threshold_rules() {
        assertThat(CareTriggerSummary.render(td("R001", "matched_count", 3)))
                .isEqualTo("近 14 天该同学有 3 次课堂缺勤");
        assertThat(CareTriggerSummary.render(td("R006", "window_days", 7, "matched_count", 2)))
                .isEqualTo("近 7 天有 2 次违纪记录");
        assertThat(CareTriggerSummary.render(td("R007")))
                .isEqualTo("请假已超期未销假");
        assertThat(CareTriggerSummary.render(td("R011a")))
                .isEqualTo("近 14 天出现纪律类离岗");
        assertThat(CareTriggerSummary.render(td("R011b", "window_days", 30)))
                .isEqualTo("近 30 天出现表现类离岗");
        assertThat(CareTriggerSummary.render(td("R012", "window_days", 30, "matched_count", 3)))
                .isEqualTo("近 30 天勤工申请被拒 3 次，未成功上岗");
    }

    @Test
    void multi_category_and_no_followup() {
        assertThat(CareTriggerSummary.render(td("R009", "distinct_categories", 3)))
                .isEqualTo("近 14 天有 3 类异常表现");
        assertThat(CareTriggerSummary.render(td("R008", "window_days", 30)))
                .isEqualTo("近 30 天未见跟进记录");
    }

    @Test
    void unknown_rule_falls_back_to_name_then_generic() {
        assertThat(CareTriggerSummary.render(td("R999", "rule_name", "某新规则")))
                .isEqualTo("某新规则");
        Map<String, Object> noName = td("R999");
        noName.remove("rule_name");
        assertThat(CareTriggerSummary.render(noName)).isEqualTo("有需要关注的情况");
    }

    @Test
    void null_or_empty_trigger_data() {
        assertThat(CareTriggerSummary.render(null)).isEqualTo("有需要关注的情况");
        assertThat(CareTriggerSummary.render(Map.of())).isEqualTo("有需要关注的情况");
    }

    @Test
    void tolerates_jsonb_numeric_as_long_or_string() {
        // JSONB 反序列化后数值可能是 Long / String，渲染须容错
        assertThat(CareTriggerSummary.render(td("R001", "window_days", 14L, "matched_count", "5")))
                .isEqualTo("近 14 天该同学有 5 次课堂缺勤");
    }
}
