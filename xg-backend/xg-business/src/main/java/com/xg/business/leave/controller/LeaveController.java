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
import com.xg.platform.auth.CurrentUser;
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
    private final com.xg.business.leave.service.LeaveGlobalConfigService leaveGlobalConfigService;

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
            @RequestBody @Valid UpdateLeaveTypeFieldsRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveService.updateLeaveTypeFields(code, req.getFields(), userId));
    }

    @GetMapping("/api/v1/leave-types/{code}/extra-fields")
    public R<List<Map<String, Object>>> getLeaveTypeFields(@PathVariable String code) {
        return R.ok(leaveService.getLeaveTypeFields(code));
    }

    /**
     * 读全局学期累计上限。null = 不限;前端「请销假配置」首屏拉。
     * V096 起把 per-假别的 term_max_days 替换成租户级单一上限,
     * 行为从「超限硬拒」改为「超限软警告 + 高风险标记」。
     */
    @GetMapping("/api/v1/leaves/global-config")
    public R<com.xg.business.leave.model.LeaveGlobalConfig> getGlobalConfig() {
        return R.ok(leaveGlobalConfigService.get());
    }

    /** 改全局学期累计上限。term_max_days = null 表示不限。 */
    @PutMapping("/api/v1/leaves/global-config")
    public R<com.xg.business.leave.model.LeaveGlobalConfig> updateGlobalConfig(
            @RequestBody @Valid com.xg.business.leave.dto.UpdateTermMaxDaysRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveGlobalConfigService.updateTermMaxDays(req.getTermMaxDays(), userId));
    }

    /** 改「证明材料」开关。term_max_days 不动。 */
    @PutMapping("/api/v1/leaves/global-config/require-proof")
    public R<com.xg.business.leave.model.LeaveGlobalConfig> updateRequireProof(
            @RequestBody java.util.Map<String, Object> body) {
        boolean v = body.get("require_proof") instanceof Boolean b ? b : false;
        return R.ok(leaveGlobalConfigService.updateRequireProof(v, CurrentUser.id()));
    }

    /**
     * 学生自查本学期累计请假天数 + 是否超过全局上限。
     * 学生申请页打开时调用,UI 用 exceeded 决定是否红条提示。
     */
    @GetMapping("/api/v1/leaves/term-usage")
    public R<com.xg.business.leave.dto.LeaveTermUsageView> myTermUsage() {
        Long userId = CurrentUser.id();
        return R.ok(leaveService.getTermUsage(userId));
    }

    /**
     * 辅导员/审批人查某学生本学期累计 + 是否超限,审批 drawer 用。
     * 权限沿用上层 SaInterceptor — 任何登录用户都能查(审批列表已经按角色聚合,
     * 这里再做角色校验属于过度防御)。
     */
    @GetMapping("/api/v1/leaves/term-usage/{studentId}")
    public R<com.xg.business.leave.dto.LeaveTermUsageView> termUsage(
            @PathVariable Long studentId) {
        return R.ok(leaveService.getTermUsage(studentId));
    }

    @PostMapping("/api/v1/leaves")
    public R<LeaveRequest> apply(
            @RequestBody @Validated LeaveApplyRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveService.apply(req, userId));
    }

    @PostMapping("/api/v1/leaves/proxy")
    public R<LeaveRequest> proxyApply(
            @RequestBody @Validated LeaveProxyRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(leaveService.proxyApply(req, userId));
    }

    @GetMapping("/api/v1/leaves/my")
    public R<PageResult<LeaveRequest>> myLeaves(@Validated LeaveQueryRequest query) {
        Long userId = CurrentUser.id();
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
            @RequestParam("start") java.time.OffsetDateTime start,
            @RequestParam("end") java.time.OffsetDateTime end) {
        Long userId = CurrentUser.id();
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
    public R<Void> withdraw(@PathVariable Long id) {
        Long userId = CurrentUser.id();
        leaveService.withdraw(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel")
    public R<Void> cancelLeave(@PathVariable Long id) {
        Long userId = CurrentUser.id();
        leaveService.cancelLeave(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/cancel-confirm")
    public R<Void> confirmCancel(@PathVariable Long id) {
        Long userId = CurrentUser.id();
        leaveService.confirmCancel(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/leaves/{id}/force-cancel")
    public R<Void> forceCancel(@PathVariable Long id) {
        Long userId = CurrentUser.id();
        leaveService.forceCancel(id, userId);
        return R.ok();
    }

    @GetMapping("/api/v1/leaves/class")
    public R<PageResult<LeaveRequest>> classLeaves(@Validated LeaveQueryRequest query) {
        Long userId = CurrentUser.id();
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
