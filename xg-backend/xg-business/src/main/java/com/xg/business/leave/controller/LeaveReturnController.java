package com.xg.business.leave.controller;

import com.xg.business.leave.dto.ManualReturnApplyRequest;
import com.xg.business.leave.dto.ManualReturnReviewRequest;
import com.xg.business.leave.dto.ReturnByLocationRequest;
import com.xg.business.leave.dto.UpdateCampusGeofenceRequest;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.service.LeaveReturnService;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 销假相关入口集中在这里,跟「请假提交 / 审批」分开。
 *
 * <p>P0 三条路径:
 * <ul>
 *   <li>{@code POST /leaves/{id}/return/by-location} — 学生 GPS 命中即销</li>
 *   <li>{@code POST /leaves/{id}/return/manual-apply} — 学生兜底申请人工销假</li>
 *   <li>{@code POST /leaves/{id}/return/manual-review} — 辅导员审核人工申请</li>
 * </ul>
 *
 * <p>校园围栏配置:GET / PUT /leave-return/campus-geofence
 * <p>门禁回调(P1 占位):POST /leave-return/access-callback
 */
@Slf4j
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class LeaveReturnController {

    private final LeaveReturnService leaveReturnService;

    /* -------------------- 销假主入口 -------------------- */

    @PostMapping("/leaves/{id}/return/by-location")
    public R<LeaveReturnService.ReturnByLocationResult> returnByLocation(
            @PathVariable Long id,
            @Valid @RequestBody ReturnByLocationRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveReturnService.submitByLocation(
                id, userId, req.getLatitude(), req.getLongitude(), req.getCapturedAt()));
    }

    @PostMapping("/leaves/{id}/return/manual-apply")
    public R<LeaveRequest> applyManualReturn(
            @PathVariable Long id,
            @Valid @RequestBody ManualReturnApplyRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveReturnService.applyManualReturn(
                id, userId, req.getReason(), req.getAttachments()));
    }

    @PostMapping("/leaves/{id}/return/manual-review")
    public R<LeaveRequest> reviewManualReturn(
            @PathVariable Long id,
            @Valid @RequestBody ManualReturnReviewRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveReturnService.reviewManualReturn(
                id, userId, Boolean.TRUE.equals(req.getApprove())));
    }

    /* -------------------- 校园围栏配置 -------------------- */

    @GetMapping("/leave-return/campus-geofence")
    public R<LeaveReturnService.Geofence> getCampusGeofence() {
        return R.ok(leaveReturnService.readGeofence());
    }

    @PutMapping("/leave-return/campus-geofence")
    public R<LeaveReturnService.Geofence> updateCampusGeofence(
            @Valid @RequestBody UpdateCampusGeofenceRequest req) {
        boolean enabled = req.getEnabled() == null || Boolean.TRUE.equals(req.getEnabled());
        return R.ok(leaveReturnService.writeGeofence(
                req.getCenterLat(), req.getCenterLng(), req.getRadiusM(), enabled));
    }

    /* -------------------- 门禁回调(P1 占位) -------------------- */

    /**
     * 门禁系统刷卡 webhook。P0 仅 log,P1 接通后:
     *   ① HMAC 校验 sign
     *   ② 学号 → student_profile → 找当前 active leave_request
     *   ③ 自动 cancelled, return_source=access_card
     */
    @PostMapping("/leave-return/access-callback")
    public R<Void> accessCardCallback(@RequestBody Map<String, Object> payload) {
        log.info("[access-card P1 stub] received payload keys={}", payload.keySet());
        return R.ok();
    }
}
