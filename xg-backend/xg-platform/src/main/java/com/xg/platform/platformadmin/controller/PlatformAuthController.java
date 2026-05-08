package com.xg.platform.platformadmin.controller;

import com.xg.common.base.R;
import com.xg.platform.platformadmin.PlatformAdminContext;
import com.xg.platform.platformadmin.dto.PlatformAdminView;
import com.xg.platform.platformadmin.dto.PlatformChangePasswordRequest;
import com.xg.platform.platformadmin.dto.PlatformLoginRequest;
import com.xg.platform.platformadmin.dto.PlatformLoginResponse;
import com.xg.platform.platformadmin.service.PlatformAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/auth")
public class PlatformAuthController {

    private final PlatformAuthService authService;

    @PostMapping("/login")
    public R<PlatformLoginResponse> login(@RequestBody @Valid PlatformLoginRequest req,
                                          HttpServletRequest request) {
        return R.ok(authService.login(req, clientIp(request), request.getHeader("User-Agent")));
    }

    @PostMapping("/logout")
    public R<Void> logout(HttpServletRequest request) {
        authService.logout(extractToken(request));
        return R.ok();
    }

    @GetMapping("/me")
    public R<PlatformAdminView> me() {
        return R.ok(authService.me(PlatformAdminContext.getAdminId()));
    }

    @PutMapping("/me/password")
    public R<Void> changeMyPassword(@RequestBody @Valid PlatformChangePasswordRequest req,
                                    HttpServletRequest request) {
        authService.changeMyPassword(PlatformAdminContext.getAdminId(), req,
                clientIp(request), request.getHeader("User-Agent"));
        return R.ok();
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null) return null;
        return header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
    }
}
