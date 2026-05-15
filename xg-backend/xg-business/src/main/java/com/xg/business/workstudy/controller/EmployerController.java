package com.xg.business.workstudy.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerQueryRequest;
import com.xg.business.workstudy.dto.EmployerSelfUpdateRequest;
import com.xg.business.workstudy.dto.EmployerStaffItem;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.service.EmployerService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
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

    /**
     * 列出该单位「可被指定为岗位负责人」的成员（leader + operators，带姓名）。
     * 给发布岗位表单的「岗位负责人」下拉用，避免用户手填 user_id。
     * 与 /employers / /employers/{id} 一致不加 permission gate —— 暴露的字段
     * 仅是单位内部分工，跨单位用户也只能看到对方的负责人是谁，不算敏感。
     */
    @GetMapping("/api/v1/work-study/employers/{id}/staff")
    public R<List<EmployerStaffItem>> listStaff(@PathVariable Long id) {
        return R.ok(employerService.listStaff(id));
    }

    @PostMapping("/api/v1/work-study/employers")
    public R<Employer> create(
            @RequestBody @Validated EmployerCreateRequest req) {
        Long userId = CurrentUser.id();
        requireAdmin(userId);
        return R.ok(employerService.create(req));
    }

    @PutMapping("/api/v1/work-study/employers/{id}")
    public R<Employer> update(
            @PathVariable Long id,
            @RequestBody @Validated EmployerUpdateRequest req) {
        Long userId = CurrentUser.id();
        requireAdmin(userId);
        return R.ok(employerService.update(id, req));
    }

    @PutMapping("/api/v1/work-study/employers/{id}/status")
    public R<Void> setStatus(
            @PathVariable Long id,
            @RequestParam String status) {
        Long userId = CurrentUser.id();
        requireAdmin(userId);
        employerService.setStatus(id, status);
        return R.ok();
    }

    /**
     * Employer 自服务：列出当前用户是 leader / operator 的所有 active 单位。
     * 常见 1 家，可多家。前端拿来在"我的单位"卡片切换。
     */
    @GetMapping("/api/v1/work-study/employers/me")
    @SaCheckPermission("workstudy:position:setup")
    public R<List<Employer>> listMine() {
        Long userId = CurrentUser.id();
        return R.ok(employerService.listMine(userId));
    }

    /**
     * Employer 自服务：修改自己单位的联系信息字段（contactName / phone / email / remark）。
     * name / leader / operator / status / allowSelfArrange 仍须走 admin 接口。
     */
    @PutMapping("/api/v1/work-study/employers/me/{id}")
    @SaCheckPermission("workstudy:position:setup")
    public R<Employer> selfUpdate(
            @PathVariable Long id,
            @RequestBody @Validated EmployerSelfUpdateRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(employerService.selfUpdate(id, userId, req));
    }

    private void requireAdmin(Long userId) {
        List<String> roles = roleLookup.findRoleCodesByUserId(userId);
        if (roles.stream().noneMatch(ADMIN_ROLES::contains)) {
            throw new BizException("FORBIDDEN", "仅学工处 / 校级管理员可管理用人单位");
        }
    }
}
