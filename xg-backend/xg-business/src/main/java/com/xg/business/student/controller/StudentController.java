package com.xg.business.student.controller;

import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.service.StudentService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class StudentController {

    private final StudentService studentService;

    @GetMapping("/api/v1/students")
    public R<PageResult<StudentView>> list(@Validated StudentQueryRequest query) {
        return R.ok(studentService.list(query));
    }

    @GetMapping("/api/v1/students/{id}")
    public R<StudentView> detail(@PathVariable Long id) {
        return R.ok(studentService.detail(id));
    }
}
