package com.xg.business.org.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.business.org.dto.AiLeaderSuggestRequest;
import com.xg.business.org.dto.AiLeaderSuggestion;
import com.xg.business.org.dto.AssignableUser;
import com.xg.business.org.dto.BatchLeaderApplyRequest;
import com.xg.business.org.dto.CounselorMappingRequest;
import com.xg.business.org.dto.CounselorMappingView;
import com.xg.business.org.dto.CreateOrgRequest;
import com.xg.business.org.dto.LeaderUpdateRequest;
import com.xg.business.org.dto.MappingPrimaryUpdateRequest;
import com.xg.business.org.dto.OrgTreeNode;
import com.xg.business.org.service.OrgAssignmentService;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 组织派班 API：班主任 + 辅导员的指派关系。
 *
 * <p>所有写操作记录 X-User-Id 作为 created_by。前端目前只在 school_admin 菜单
 * 暴露入口；P0 不在 Controller 层硬性 role gate（保持跟 SystemUserController
 * 一致）。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/org")
public class OrgAssignmentController {

    private final OrgAssignmentService service;

    @GetMapping("/tree")
    public R<List<OrgTreeNode>> tree() {
        return R.ok(service.getTree());
    }

    /** 新建组织节点(P0 前端只用于"新增院系")。返回新建的 id。 */
    @PostMapping
    @SaCheckPermission("system:org:manage")
    public R<java.util.Map<String, String>> createOrg(@RequestBody @Valid CreateOrgRequest req) {
        Long id = service.createOrg(req);
        return R.ok(java.util.Map.of("id", String.valueOf(id)));
    }

    @GetMapping("/class-masters")
    public R<List<AssignableUser>> classMasters() {
        return R.ok(service.listClassMasters());
    }

    @GetMapping("/counselors")
    public R<List<AssignableUser>> counselors() {
        return R.ok(service.listCounselors());
    }

    /** 设/清班主任。leaderId=null 即清空。 */
    @PutMapping("/{classId}/leader")
    @SaCheckPermission("system:org:manage")
    public R<Void> updateLeader(@PathVariable Long classId,
                                @RequestBody LeaderUpdateRequest req) {
        service.updateLeader(classId, req.getLeaderId());
        return R.ok();
    }

    @PostMapping("/counselor-mappings")
    @SaCheckPermission("system:org:manage")
    public R<CounselorMappingView> createMapping(
            @RequestBody @Valid CounselorMappingRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(service.createMapping(req, userId));
    }

    @PutMapping("/counselor-mappings/{id}")
    @SaCheckPermission("system:org:manage")
    public R<Void> updatePrimary(@PathVariable Long id,
                                 @RequestBody @Valid MappingPrimaryUpdateRequest req) {
        service.updateMappingPrimary(id, req.getIsPrimary());
        return R.ok();
    }

    @DeleteMapping("/counselor-mappings/{id}")
    @SaCheckPermission("system:org:manage")
    public R<Void> deleteMapping(@PathVariable Long id) {
        service.deleteMapping(id);
        return R.ok();
    }

    /** AI 班主任推荐：给 scope 内每个缺班主任的班配一个候选。仅生成方案，不写库。 */
    @PostMapping("/ai-suggest-leaders")
    @SaCheckPermission("system:org:manage")
    public R<List<AiLeaderSuggestion>> aiSuggestLeaders(@RequestBody AiLeaderSuggestRequest req) {
        return R.ok(service.aiSuggestLeaders(req));
    }

    /** 批量应用班主任指派。单事务，任一失败整体回滚。 */
    @PostMapping("/batch-apply-leaders")
    @SaCheckPermission("system:org:manage")
    public R<Void> batchApplyLeaders(@RequestBody BatchLeaderApplyRequest req) {
        service.batchApplyLeaders(req);
        return R.ok();
    }
}
