package com.xg.platform.auth.controller;

import cn.dev33.satoken.stp.StpInterface;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.auth.dto.ChangeMyPasswordRequest;
import com.xg.platform.auth.dto.CurrentUserView;
import com.xg.platform.auth.dto.LoginRequest;
import com.xg.platform.auth.dto.LoginResponse;
import com.xg.platform.auth.dto.UpdateMyProfileRequest;
import com.xg.platform.auth.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final StpInterface stpInterface;

    @PostMapping("/api/v1/auth/login")
    public R<LoginResponse> login(@RequestBody @Valid LoginRequest req) {
        return R.ok(authService.login(req));
    }

    @GetMapping("/api/v1/auth/me")
    public R<CurrentUserView> me() {
        return R.ok(authService.me(CurrentUser.id()));
    }

    @PutMapping("/api/v1/auth/me/profile")
    public R<CurrentUserView> updateMyProfile(@RequestBody @Valid UpdateMyProfileRequest req) {
        return R.ok(authService.updateMyProfile(CurrentUser.id(), req));
    }

    @PutMapping("/api/v1/auth/me/password")
    public R<Void> changeMyPassword(@RequestBody @Valid ChangeMyPasswordRequest req) {
        authService.changeMyPassword(CurrentUser.id(), req);
        return R.ok();
    }

    /** 当前用户的角色码 + 解析出的全部权限码。前端按权限码过滤菜单 / 按钮。 */
    @GetMapping("/api/v1/auth/me/perms")
    public R<Map<String, List<String>>> myPerms() {
        Long userId = CurrentUser.id();
        List<String> roles = stpInterface.getRoleList(userId, "login");
        List<String> perms = stpInterface.getPermissionList(userId, "login");
        return R.ok(Map.of("roles", roles, "perms", perms));
    }
}
