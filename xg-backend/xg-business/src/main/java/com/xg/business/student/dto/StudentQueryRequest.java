package com.xg.business.student.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class StudentQueryRequest extends PageQuery {
    private String keyword;
    private String grade;
    private String status;
    private String college;
    private String major;
    private String className;
    /** 性别。值: male / female / 其它(不限),来自 sys_user.gender。 */
    private String gender;
    /** 书院筛选(双轨制)。单轨学校无此数据,传值不会命中任何行。 */
    private String academy;
    /** 楼栋筛选(双轨制,书院下属层级)。 */
    private String dormBlock;
}
