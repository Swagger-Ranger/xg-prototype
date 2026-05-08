package com.xg.business.counselortalk.controller;

import com.xg.business.counselortalk.dto.CounselorTalkCreateRequest;
import com.xg.business.counselortalk.dto.CounselorTalkQueryRequest;
import com.xg.business.counselortalk.model.CounselorTalk;
import com.xg.business.counselortalk.service.CounselorTalkService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class CounselorTalkController {

    private final CounselorTalkService counselorTalkService;

    @PostMapping("/api/v1/counselor-talks")
    public R<CounselorTalk> create(
            @RequestBody @Validated CounselorTalkCreateRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(counselorTalkService.create(req, userId, userName));
    }

    @GetMapping("/api/v1/counselor-talks")
    public R<PageResult<CounselorTalk>> list(@Validated CounselorTalkQueryRequest query) {
        return R.ok(counselorTalkService.list(query));
    }

    @GetMapping("/api/v1/counselor-talks/{id}")
    public R<CounselorTalk> detail(@PathVariable Long id) {
        return R.ok(counselorTalkService.detail(id));
    }
}
