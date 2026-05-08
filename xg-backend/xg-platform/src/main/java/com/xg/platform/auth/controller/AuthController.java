package com.xg.platform.auth.controller;

import com.xg.common.base.R;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/api/v1/auth/login")
    public R<LoginResponse> login(@RequestBody @Valid LoginRequest req) {
        return R.ok(authService.login(req));
    }

    @GetMapping("/api/v1/auth/me")
    public R<CurrentUserView> me(@RequestHeader("X-User-Id") Long userId) {
        return R.ok(authService.me(userId));
    }

    @PutMapping("/api/v1/auth/me/profile")
    public R<CurrentUserView> updateMyProfile(@RequestHeader("X-User-Id") Long userId,
                                               @RequestBody @Valid UpdateMyProfileRequest req) {
        return R.ok(authService.updateMyProfile(userId, req));
    }

    @PutMapping("/api/v1/auth/me/password")
    public R<Void> changeMyPassword(@RequestHeader("X-User-Id") Long userId,
                                     @RequestBody @Valid ChangeMyPasswordRequest req) {
        authService.changeMyPassword(userId, req);
        return R.ok();
    }
}
