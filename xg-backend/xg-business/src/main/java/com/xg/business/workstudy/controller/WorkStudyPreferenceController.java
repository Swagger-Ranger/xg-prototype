package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.WorkStudyPreferenceUpsertRequest;
import com.xg.business.workstudy.model.StudentWorkStudyPreference;
import com.xg.business.workstudy.service.WorkStudyPreferenceService;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 学生勤工助学偏好（"我的"端点）：课表 + 岗位偏好。
 * 仅当前登录学生本人可读写自己那一份。
 */
@RestController
@RequiredArgsConstructor
public class WorkStudyPreferenceController {

    private final WorkStudyPreferenceService preferenceService;

    @GetMapping("/api/v1/work-study/me/preference")
    public R<StudentWorkStudyPreference> mine() {
        Long userId = CurrentUser.id();
        return R.ok(preferenceService.findByStudent(userId));
    }

    @PutMapping("/api/v1/work-study/me/preference")
    public R<StudentWorkStudyPreference> save(
            @RequestBody WorkStudyPreferenceUpsertRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(preferenceService.upsert(userId, req));
    }
}
