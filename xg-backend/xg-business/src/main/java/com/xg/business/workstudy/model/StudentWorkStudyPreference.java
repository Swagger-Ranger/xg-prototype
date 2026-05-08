package com.xg.business.workstudy.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.xg.common.base.BaseEntity;
import com.xg.common.mybatis.JsonbTypeHandler;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName(value = "student_workstudy_preference", autoResultMap = true)
public class StudentWorkStudyPreference extends BaseEntity {

    @TableField("student_id")
    private Long studentId;

    /**
     * 7 天 × 5 段（钟点制）的"有课"格子。例：
     *   {"mon":["p1","p2"], "tue":[], ...}
     * pX 含义：p1=8-10 / p2=10-12 / p3=14-16 / p4=16-18 / p5=19-21
     * 字段以原始 JSON 字符串透传，前后端共享语义、Java 层不做反序列化校验。
     */
    @TableField(value = "course_schedule", typeHandler = JsonbTypeHandler.class)
    private String courseSchedule;

    /**
     * 岗位偏好。例：{"types":["fixed"],"campus":"本部","rate_min":20,"rate_max":40,"keywords":"图书馆"}
     */
    @TableField(value = "position_pref", typeHandler = JsonbTypeHandler.class)
    private String positionPref;
}
