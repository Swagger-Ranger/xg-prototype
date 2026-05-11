package com.xg.business.student.controller;

import com.xg.business.student.dto.ClassRosterEntry;
import com.xg.business.student.dto.StudentInsightResponse;
import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.service.StudentInsightService;
import com.xg.business.student.service.StudentService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class StudentController {

    private final StudentService studentService;
    private final StudentInsightService insightService;

    /**
     * 双参数:
     *   - StudentQueryRequest 走 @ModelAttribute 拿 page/size (含 PageQuery 校验)
     *   - allParams 是原始 query string,字段目录驱动的 SqlBuilder 直接消费它
     * 这样新增 filter = 改 yaml 一处,Java 端无需为新字段加 DTO 字段。
     */
    @GetMapping("/api/v1/students")
    public R<PageResult<StudentView>> list(
            @Validated StudentQueryRequest pageQuery,
            @RequestParam Map<String, String> allParams) {
        return R.ok(studentService.list(pageQuery, allParams));
    }

    /**
     * Distinct class names under an optional college / major filter, used by
     * the cascading 班级 filter on the student-info page.
     *
     * <p>Mounted at {@code /student-classes} (not {@code /students/classes}) on
     * purpose — Spring would otherwise dispatch GET /students/classes to the
     * {@code {id}} handler and fail to parse "classes" as a Long.
     */
    @GetMapping("/api/v1/student-classes")
    public R<List<String>> listClasses(
            @RequestParam(required = false) String college,
            @RequestParam(required = false) String major) {
        return R.ok(studentService.listClassNames(college, major));
    }

    /**
     * 双轨制 filter 数据源——书院 / 楼栋名字。空数组 = 该租户没启用书院制。
     * 同 endpoint 走 /student-residential-options 避开 /students/{id} 路径冲突。
     */
    @GetMapping("/api/v1/student-residential-options")
    public R<Map<String, List<String>>> residentialOptions() {
        return R.ok(Map.of(
                "academies", studentService.listResidentialUnitNames("academy"),
                "dormBlocks", studentService.listResidentialUnitNames("dorm_block")
        ));
    }

    /**
     * 改书院班 modal 数据源:扁平 [{id, name, academy_name}],按所属书院分组渲染。
     * 比 /student-residential-options 多一份 id,因为绑定要按 id 写。
     */
    @GetMapping("/api/v1/student-residential-classes")
    public R<List<Map<String, Object>>> residentialClasses() {
        return R.ok(studentService.listResidentialClasses());
    }

    @GetMapping("/api/v1/students/{id}")
    public R<StudentView> detail(@PathVariable Long id) {
        return R.ok(studentService.detail(id));
    }

    @GetMapping("/api/v1/students/{id}/insight")
    public R<StudentInsightResponse> insight(@PathVariable Long id) {
        return R.ok(insightService.compute(id));
    }

    @PutMapping("/api/v1/students/{id}/extended-info")
    public R<Void> updateExtendedInfo(@PathVariable Long id,
                                      @RequestBody Map<String, Object> patch) {
        studentService.updateExtendedInfo(id, patch);
        return R.ok();
    }

    /**
     * 改学生书院班归属。body:{ "org_unit_id": 1110 } 或 { "org_unit_id": null } 清空。
     * 只动 track='residential' + type='dorm_block' 那条 membership,不影响学院班。
     */
    @PutMapping("/api/v1/students/{id}/residential-class")
    public R<Void> setResidentialClass(@PathVariable Long id,
                                       @RequestBody Map<String, Object> body) {
        Object raw = body == null ? null : body.get("org_unit_id");
        Long orgUnitId = null;
        if (raw instanceof Number) orgUnitId = ((Number) raw).longValue();
        else if (raw instanceof String s && !s.isBlank()) orgUnitId = Long.parseLong(s);
        studentService.setResidentialClass(id, orgUnitId);
        return R.ok();
    }

    @GetMapping("/api/v1/counselor/class-roster")
    public R<List<ClassRosterEntry>> classRoster() {
        Long userId = CurrentUser.id();
        return R.ok(studentService.classRoster(userId));
    }

    /**
     * 当前学生自己的扩展信息（紧急联系人电话等），用于请假等表单的预填。
     * 路径放在 /students-me 而不是 /students/me/...，避开与 /students/{id} 的
     * 路径变量冲突——同样的考虑见 listClasses 的注释。
     */
    @GetMapping("/api/v1/students-me/extended-info")
    public R<Map<String, Object>> myExtendedInfo() {
        Long userId = CurrentUser.id();
        return R.ok(studentService.myExtendedInfo(userId));
    }

    /**
     * 当前学生自己的学籍 view（学院/专业/班级/学籍状态等），用于校园页学籍卡。
     * 非学生角色调用会拿到 null（前端应据此隐藏卡片），不抛错。
     */
    @GetMapping("/api/v1/students-me")
    public R<StudentView> myProfile() {
        Long userId = CurrentUser.id();
        return R.ok(studentService.selfDetail(userId));
    }
}
