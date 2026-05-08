package com.xg.business.student.controller;

import com.xg.business.student.dto.ClassRosterEntry;
import com.xg.business.student.dto.StudentInsightResponse;
import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.service.StudentInsightService;
import com.xg.business.student.service.StudentService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
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

    @GetMapping("/api/v1/students")
    public R<PageResult<StudentView>> list(@Validated StudentQueryRequest query) {
        return R.ok(studentService.list(query));
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

    @GetMapping("/api/v1/counselor/class-roster")
    public R<List<ClassRosterEntry>> classRoster(@RequestHeader("X-User-Id") Long userId) {
        return R.ok(studentService.classRoster(userId));
    }

    /**
     * 当前学生自己的扩展信息（紧急联系人电话等），用于请假等表单的预填。
     * 路径放在 /students-me 而不是 /students/me/...，避开与 /students/{id} 的
     * 路径变量冲突——同样的考虑见 listClasses 的注释。
     */
    @GetMapping("/api/v1/students-me/extended-info")
    public R<Map<String, Object>> myExtendedInfo(@RequestHeader("X-User-Id") Long userId) {
        return R.ok(studentService.myExtendedInfo(userId));
    }

    /**
     * 当前学生自己的学籍 view（学院/专业/班级/学籍状态等），用于校园页学籍卡。
     * 非学生角色调用会拿到 null（前端应据此隐藏卡片），不抛错。
     */
    @GetMapping("/api/v1/students-me")
    public R<StudentView> myProfile(@RequestHeader("X-User-Id") Long userId) {
        return R.ok(studentService.selfDetail(userId));
    }
}
