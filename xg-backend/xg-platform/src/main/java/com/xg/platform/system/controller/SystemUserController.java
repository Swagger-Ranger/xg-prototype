package com.xg.platform.system.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.system.dto.CreateUserRequest;
import com.xg.platform.system.dto.SystemUserQueryRequest;
import com.xg.platform.system.dto.SystemUserView;
import com.xg.platform.system.dto.UpdateUserRequest;
import com.xg.platform.system.service.SystemUserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class SystemUserController {

    private final SystemUserService systemUserService;

    @GetMapping("/api/v1/system/users")
    @SaCheckPermission("system:user:manage")
    public R<PageResult<SystemUserView>> list(@Validated SystemUserQueryRequest query) {
        return R.ok(systemUserService.list(query));
    }

    @PostMapping("/api/v1/system/users")
    @SaCheckPermission("system:user:manage")
    public R<SystemUserView> create(@RequestBody @Validated CreateUserRequest req) {
        return R.ok(systemUserService.create(req));
    }

    @PutMapping("/api/v1/system/users/{id}")
    @SaCheckPermission("system:user:manage")
    public R<Void> update(@PathVariable Long id, @RequestBody @Validated UpdateUserRequest req) {
        systemUserService.update(id, req);
        return R.ok();
    }

    @PostMapping("/api/v1/system/users/{id}/reset-password")
    @SaCheckPermission("system:user:manage")
    public R<Void> resetPassword(@PathVariable Long id) {
        systemUserService.resetPassword(id);
        return R.ok();
    }
}
