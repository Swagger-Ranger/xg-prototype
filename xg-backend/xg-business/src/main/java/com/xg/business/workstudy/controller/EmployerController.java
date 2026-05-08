package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerQueryRequest;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.service.EmployerService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@RestController
@RequiredArgsConstructor
public class EmployerController {

    private static final Set<String> ADMIN_ROLES = Set.of("student_affairs_officer", "school_admin");

    private final EmployerService employerService;
    private final AssigneeLookupMapper roleLookup;

    @GetMapping("/api/v1/work-study/employers")
    public R<PageResult<Employer>> list(@Validated EmployerQueryRequest query) {
        return R.ok(employerService.list(query));
    }

    @GetMapping("/api/v1/work-study/employers/{id}")
    public R<Employer> detail(@PathVariable Long id) {
        return R.ok(employerService.detail(id));
    }

    @PostMapping("/api/v1/work-study/employers")
    public R<Employer> create(
            @RequestBody @Validated EmployerCreateRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        requireAdmin(userId);
        return R.ok(employerService.create(req));
    }

    @PutMapping("/api/v1/work-study/employers/{id}")
    public R<Employer> update(
            @PathVariable Long id,
            @RequestBody @Validated EmployerUpdateRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        requireAdmin(userId);
        return R.ok(employerService.update(id, req));
    }

    @PutMapping("/api/v1/work-study/employers/{id}/status")
    public R<Void> setStatus(
            @PathVariable Long id,
            @RequestParam String status,
            @RequestHeader("X-User-Id") Long userId) {
        requireAdmin(userId);
        employerService.setStatus(id, status);
        return R.ok();
    }

    private void requireAdmin(Long userId) {
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可管理用人单位");
        }
    }
}
