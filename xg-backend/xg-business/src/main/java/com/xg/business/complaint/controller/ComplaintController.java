package com.xg.business.complaint.controller;

import com.xg.business.complaint.dto.ComplaintFeedbackRequest;
import com.xg.business.complaint.dto.ComplaintQueryRequest;
import com.xg.business.complaint.dto.ReplyComplaintRequest;
import com.xg.business.complaint.dto.SubmitComplaintRequest;
import com.xg.business.complaint.model.Complaint;
import com.xg.business.complaint.service.ComplaintService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class ComplaintController {

    private final ComplaintService complaintService;

    @PostMapping("/api/v1/complaints")
    public R<Complaint> submit(
            @RequestBody @Validated SubmitComplaintRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        return R.ok(complaintService.submit(req, userId, userName));
    }

    @GetMapping("/api/v1/complaints/my")
    public R<PageResult<Complaint>> myComplaints(
            @RequestHeader("X-User-Id") Long userId,
            @Validated ComplaintQueryRequest query) {
        return R.ok(complaintService.myComplaints(userId, query));
    }

    @GetMapping("/api/v1/complaints")
    public R<PageResult<Complaint>> listAll(@Validated ComplaintQueryRequest query) {
        return R.ok(complaintService.listAll(query));
    }

    @PutMapping("/api/v1/complaints/{id}/reply")
    public R<Void> reply(
            @PathVariable Long id,
            @RequestBody @Validated ReplyComplaintRequest req,
            @RequestHeader("X-User-Id") Long userId,
            @RequestHeader(value = "X-User-Name", defaultValue = "Unknown") String userName) {
        complaintService.reply(id, req, userId, userName);
        return R.ok();
    }

    @PutMapping("/api/v1/complaints/{id}/feedback")
    public R<Void> feedback(
            @PathVariable Long id,
            @RequestBody @Validated ComplaintFeedbackRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        complaintService.feedback(id, req, userId);
        return R.ok();
    }
}
