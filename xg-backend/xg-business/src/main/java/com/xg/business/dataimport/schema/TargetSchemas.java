package com.xg.business.dataimport.schema;

import com.xg.common.exception.BizException;

import java.util.List;
import java.util.Map;

/**
 * 三场景的目标字段表，Phase B 启发式 + AI 列映射都用这张表当 anchor。
 * 改字段时同步更新 ImportExecutor 的写库逻辑。
 */
public final class TargetSchemas {

    private TargetSchemas() {}

    public static final List<TargetField> STUDENT = List.of(
            new TargetField("student_no",      "学号",    true,
                    List.of("学号", "学籍号", "学生编号", "student_no", "student_id"), "基础"),
            new TargetField("real_name",       "姓名",    true,
                    List.of("姓名", "学生姓名", "name", "真实姓名"), "基础"),
            new TargetField("gender",          "性别",    false,
                    List.of("性别", "gender", "sex"), "基础"),
            new TargetField("phone",           "手机号",  false,
                    List.of("手机", "手机号", "联系电话", "电话", "phone", "mobile"), "联系"),
            new TargetField("email",           "邮箱",    false,
                    List.of("邮箱", "电子邮箱", "email", "mail"), "联系"),
            new TargetField("college",         "学院",    true,
                    List.of("学院", "院系", "所在学院", "院部", "college"), "组织"),
            new TargetField("major",           "专业",    false,
                    List.of("专业", "所在专业", "major"), "组织"),
            new TargetField("grade",           "年级",    false,
                    List.of("年级", "入学年份", "入学年级", "grade"), "组织"),
            new TargetField("class_name",      "班级",    true,
                    List.of("班级", "行政班", "所在班级", "class", "class_name"), "组织"),
            new TargetField("enrollment_date", "入学日期", false,
                    List.of("入学日期", "入学时间", "enrollment_date"), "学籍"),
            new TargetField("status",          "学籍状态", false,
                    List.of("学籍状态", "状态", "在校状态"), "学籍"),
            new TargetField("aid_level",       "困难等级", false,
                    List.of("困难等级", "困难类别", "贫困等级", "资助等级"), "学籍"),
            new TargetField("education_level", "培养层次", false,
                    List.of("培养层次", "学历层次", "学位类型", "教育层次"), "学籍")
    );

    public static final List<TargetField> TEACHER = List.of(
            new TargetField("username",   "工号",     true,
                    List.of("工号", "教工号", "员工编号", "username"), "基础"),
            new TargetField("real_name",  "姓名",     true,
                    List.of("姓名", "教师姓名", "name"), "基础"),
            new TargetField("gender",     "性别",     false,
                    List.of("性别", "gender"), "基础"),
            new TargetField("phone",      "手机号",   false,
                    List.of("手机", "手机号", "联系电话", "phone"), "联系"),
            new TargetField("email",      "邮箱",     false,
                    List.of("邮箱", "电子邮箱", "email"), "联系"),
            // 可选: 填了的话教师导入会自动给这个人加 sys_user_role(role='teacher', org_id=<resolved>)
            // 学院名命中 org_unit 现有节点 → 复用; 命不中 → 当机关部门 (admin_dept) 顺手建。
            new TargetField("org_name",   "所在单位", false,
                    List.of("所在单位", "所属单位", "所在学院", "归属单位", "部门", "学院", "院系"), "归属")
    );

    public static final List<TargetField> COUNSELOR = List.of(
            new TargetField("username",   "工号",       true,
                    List.of("工号", "教工号", "username"), "匹配"),
            new TargetField("real_name",  "教师姓名",   true,
                    List.of("姓名", "教师姓名", "name"), "匹配"),
            new TargetField("org_name",   "从属单位",   true,
                    List.of("从属单位", "所属单位", "归属单位", "部门", "院系", "所在学院"), "归属"),
            new TargetField("role_code",  "角色",       false,
                    List.of("角色", "岗位", "职务"), "归属")
    );

    private static final Map<String, List<TargetField>> BY_SCENARIO = Map.of(
            "student",   STUDENT,
            "teacher",   TEACHER,
            "counselor", COUNSELOR
    );

    public static List<TargetField> forScenario(String scenario) {
        List<TargetField> list = BY_SCENARIO.get(scenario);
        if (list == null) {
            throw new BizException("IMPORT_SCENARIO_INVALID", "未知场景：" + scenario);
        }
        return list;
    }
}
