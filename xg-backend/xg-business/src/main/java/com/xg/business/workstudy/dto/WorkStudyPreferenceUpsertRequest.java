package com.xg.business.workstudy.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 学生勤工助学偏好的写入体。两个字段都用 raw JSON 字符串透传，
 * 形态校验在前端做（节次只能是 p1-p5，day 只能是 mon-sun 等）。
 */
@Getter
@Setter
public class WorkStudyPreferenceUpsertRequest {
    /** {@code {"mon":["p1","p2"],...}}；缺省=没标任何有课时段（全空闲）。 */
    private String courseSchedule;

    /** {@code {"types":["fixed"],"campus":"...","rate_min":20,"rate_max":40,"keywords":"..."}}。 */
    private String positionPref;
}
