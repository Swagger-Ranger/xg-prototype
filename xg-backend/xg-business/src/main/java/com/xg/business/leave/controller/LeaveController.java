package com.xg.business.leave.controller;

import com.xg.business.leave.dto.LeaveApplyRequest;
import com.xg.business.leave.dto.LeaveImpactView;
import com.xg.business.leave.dto.LeaveProxyRequest;
import com.xg.business.leave.dto.LeaveQueryRequest;
import com.xg.business.leave.dto.UpdateLeaveTypeFieldsRequest;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.business.leave.service.LeaveImpactService;
import com.xg.business.leave.service.LeaveService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class LeaveController {

    private final LeaveService leaveService;
    private final LeaveImpactService leaveImpactService;
    private final com.xg.business.leave.service.LeaveConfigBaseService leaveConfigBaseService;
    private final com.xg.business.leave.service.LeaveNoticeConfigService leaveNoticeConfigService;

    @GetMapping("/api/v1/leave-types")
    public R<List<LeaveTypeConfig>> listLeaveTypes() {
        return R.ok(leaveService.listLeaveTypes());
    }

    /**
     * Replace the per-leave-type extra_fields with the supplied list. No draft/
     * version semantics — change takes effect immediately. In-flight requests
     * are unaffected because their form_data is already persisted on the leave
     * row.
     */
    @PutMapping("/api/v1/leave-types/{code}/extra-fields")
    public R<LeaveTypeConfig> updateLeaveTypeFields(
            @PathVariable String code,
            @RequestBody @Valid UpdateLeaveTypeFieldsRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(leaveService.updateLeaveTypeFields(code, req.getFields(), userId));
    }

    @GetMapping("/api/v1/leave-types/{code}/extra-fields")
    public R<List<Map<String, Object>>> getLeaveTypeFields(@PathVariable String code) {
        return R.ok(leaveService.getLeaveTypeFields(code));
    }

    /** 改某假别的「本学期累计上限」(天数,可半天)。null 等价于不限。 */
    @PutMapping("/api/v1/leave-types/{code}/term-max-days")
    public R<LeaveTypeConfig> updateTermMaxDays(
            @PathVariable String code,
            @RequestBody @Valid com.xg.business.leave.dto.UpdateTermMaxDaysRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(leaveConfigBaseService.updateTermMaxDays(code, req.getTermMaxDays(), userId));
    }

    @PostMapping("/api/v1/leaves")
    public R<LeaveRequest> apply(
            @RequestBody @Validated LeaveApplyRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(leaveService.apply(req, userId));
    }

    @PostMapping("/api/v1/leaves/proxy")
    public R<LeaveRequest> proxyApply(
            @RequestBody @Validated LeaveProxyRequest req,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(leaveService.proxyApply(req, userId));
    }

    @GetMapping("/api/v1/leaves/my")
    public R<PageResult<LeaveRequest>> myLeaves(
            @RequestHeader("X-User-Id") Long userId,
            @Validated LeaveQueryRequest query) {
        return R.ok(leaveService.myLeaves(userId, query));
    }

    @GetMapping("/api/v1/leaves/{id}")
    public R<LeaveRequest> getDetail(@PathVariable Long id) {
        return R.ok(leaveService.getDetail(id));
    }

    /**
     * 请假影响课程视图：辅导员审批时点击 trigger 展开看具体被耽误的课。
     * 数据缺失（无课表 / 学生无班级）返回 zero 视图，UI 用 totalPeriods === 0 判空态。
     */
    @GetMapping("/api/v1/leaves/{id}/impact")
    public R<LeaveImpactView> impact(@PathVariable Long id) {
        return R.ok(leaveImpactService.compute(id));
    }

    /**
     * 学生填表时的预览:输入起止时间,即时返回该时段会缺的课程。
     * student_id 取自 X-User-Id header(学生只能查自己的),不依赖 leave_request 行。
     * 数据缺失(无课表 / 学生无班级 / 学期间隙)返回 zero 视图。
     */
    @GetMapping("/api/v1/leaves/impact/preview")
    public R<LeaveImpactView> impactPreview(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam("start") java.time.OffsetDateTime start,
            @RequestParam("end") java.time.OffsetDateTime end) {
        return R.ok(leaveImpactService.computeFor(userId, start, end));
    }

    /** 读「请假影响课程」开关。缺失默认 true。 */
    @GetMapping("/api/v1/leaves/impact/config")
    public R<Map<String, Object>> getImpactConfig() {
        return R.ok(Map.of("enabled", leaveImpactService.isImpactEnabled()));
    }

    /** 改「请假影响课程」开关。关闭后 preview / 审批 drawer 都拿到 zero 视图,UI 自动隐藏。 */
    @PutMapping("/api/v1/leaves/impact/config")
    public R<Map<String, Object>> updateImpactConfig(
            @RequestBody Map<String, Object> body) {
        Object v = body.get("enabled");
        boolean enabled = !(v instanceof Boolean) || (Boolean) v;
        leaveImpactService.setImpactEnabled(enabled);
        return R.ok(Map.of("enabled", enabled));
    }

    /** 读「请假须知」配置:进入请假页弹「说明」+ 提交前弹「承诺书」。仅学生端使用,缺省走内置默认文案。 */
    @GetMapping("/api/v1/leaves/notice/config")
    public R<com.xg.business.leave.dto.LeaveNoticeConfig> getNoticeConfig() {
        return R.ok(leaveNoticeConfigService.get());
    }

    /** 改「请假须知」配置 —— 部分字段更新,未传字段保持原值。 */
    @PutMapping("/api/v1/leaves/notice/config")
    public R<com.xg.business.leave.dto.LeaveNoticeConfig> updateNoticeConfig(
            @RequestBody @Valid com.xg.business.leave.dto.LeaveNoticeConfig req) {
        return R.ok(leaveNoticeConfigService.update(req));
    }

    @PostMapping("/api/v1/leaves/{id}/withdraw")
    public R<Void> withdraw(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.withdraw(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel")
    public R<Void> cancelLeave(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.cancelLeave(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel-confirm")
    public R<Void> confirmCancel(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.confirmCancel(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/force-cancel")
    public R<Void> forceCancel(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        leaveService.forceCancel(id, userId);
        return R.ok();
    }

    @GetMapping("/api/v1/leaves/class")
    public R<PageResult<LeaveRequest>> classLeaves(
            @RequestHeader("X-User-Id") Long userId,
            @Validated LeaveQueryRequest query) {
        return R.ok(leaveService.classLeaves(userId, query));
    }

    @GetMapping("/api/v1/leaves/uncancelled")
    public R<PageResult<LeaveRequest>> uncancelledLeaves(@Validated LeaveQueryRequest query) {
        return R.ok(leaveService.uncancelledLeaves(query));
    }

    @GetMapping("/api/v1/leaves/pending-manual-returns")
    public R<PageResult<LeaveRequest>> pendingManualReturns(@Validated LeaveQueryRequest query) {
        return R.ok(leaveService.pendingManualReturns(query));
    }

    @GetMapping("/api/v1/leaves/stats")
    public R<Map<String, Object>> leaveStats(@Validated LeaveQueryRequest query) {
        return R.ok(leaveService.leaveStats(query));
    }
}
