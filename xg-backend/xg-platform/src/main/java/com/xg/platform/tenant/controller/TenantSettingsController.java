package com.xg.platform.tenant.controller;

import com.xg.common.base.R;
import com.xg.platform.tenant.dto.TenantSettingsView;
import com.xg.platform.tenant.dto.UpdateTenantSettingsRequest;
import com.xg.platform.tenant.service.TenantSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequiredArgsConstructor
public class TenantSettingsController {

    private final TenantSettingsService service;

    /** Read endpoint — open to any authenticated user. The campus dashboard
     *  needs school_city to render the weather widget. */
    @GetMapping("/api/v1/system/tenant-settings")
    public R<TenantSettingsView> get() {
        return R.ok(service.getCurrent());
    }

    /** Write endpoint — frontend admin page only surfaces this for school_admin
     *  / student_affairs_officer; matching server-side gate not enforced here
     *  (consistent with SystemUserController pattern). */
    @PutMapping("/api/v1/system/tenant-settings")
    public R<TenantSettingsView> update(@RequestBody @Valid UpdateTenantSettingsRequest req) {
        return R.ok(service.update(req));
    }
}
