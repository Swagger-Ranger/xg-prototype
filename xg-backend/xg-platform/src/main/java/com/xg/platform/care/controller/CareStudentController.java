package com.xg.platform.care.controller;

import com.xg.common.base.R;
import com.xg.platform.care.service.CareStudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 学生侧只读关怀摘要（PRD §13.3）。"我的" → "个人信息保护" → "我的关怀记录"
 * 兜底知情权入口：不主推、不弹窗、不通知。
 *
 * <p>无 studentId 入参 —— student_id 由 service 强制取 CurrentUser.id()，
 * 越权查他人在结构上不可能（PRD §13.3 权限红线）。
 */
@RestController
@RequiredArgsConstructor
public class CareStudentController {

    private final CareStudentService careStudentService;

    @GetMapping("/api/v1/care/me/active-summary")
    public R<Map<String, Object>> activeSummary() {
        return R.ok(careStudentService.activeSummary());
    }
}
