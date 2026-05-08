package com.xg.platform.notification.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.common.base.R;
import com.xg.platform.notification.model.CareRule;
import com.xg.platform.notification.model.NotificationPreference;
import com.xg.platform.notification.model.NotificationTemplate;
import com.xg.platform.notification.service.NotificationCenterService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 通知中心配置面板 API。系统管理员(system:manage)用,集中管的:
 *   * 通知模板(文案 + 默认渠道 + 启停)
 *   * 渠道偏好(角色 × 模板 → 渠道列表)
 *   * 关怀规则(P0 只 enable/disable)
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/notification-center")
public class NotificationCenterController {

    private final NotificationCenterService service;

    /* ───────── 模板 ───────── */

    @GetMapping("/templates")
    @SaCheckPermission("system:manage")
    public R<List<NotificationTemplate>> listTemplates() {
        return R.ok(service.listTemplates());
    }

    @PutMapping("/templates/{code}")
    @SaCheckPermission("system:manage")
    public R<NotificationTemplate> updateTemplate(@PathVariable String code,
                                                  @RequestBody NotificationTemplate patch) {
        return R.ok(service.updateTemplate(code, patch));
    }

    /* ───────── 偏好 ───────── */

    @GetMapping("/preferences")
    @SaCheckPermission("system:manage")
    public R<List<NotificationPreference>> listPreferences(
            @RequestParam(value = "scope_type", required = false) String scopeType) {
        return R.ok(service.listPreferences(scopeType));
    }

    @PutMapping("/preferences")
    @SaCheckPermission("system:manage")
    public R<NotificationPreference> upsertPreference(@RequestBody Map<String, Object> body) {
        String scopeType = (String) body.get("scope_type");
        String scopeValue = (String) body.get("scope_value");
        String templateCode = (String) body.get("template_code");
        @SuppressWarnings("unchecked")
        List<String> channels = (List<String>) body.get("channels");
        Object mutedObj = body.get("muted");
        Boolean muted = mutedObj instanceof Boolean ? (Boolean) mutedObj : null;
        return R.ok(service.upsertPreference(scopeType, scopeValue, templateCode, channels, muted));
    }

    /* ───────── 关怀规则 ───────── */

    @GetMapping("/care-rules")
    @SaCheckPermission("system:manage")
    public R<List<CareRule>> listCareRules() {
        return R.ok(service.listCareRules());
    }

    @PutMapping("/care-rules/{code}")
    @SaCheckPermission("system:manage")
    public R<CareRule> updateCareRule(@PathVariable String code,
                                      @RequestBody Map<String, Object> body) {
        boolean enabled = !(body.get("enabled") instanceof Boolean) || (Boolean) body.get("enabled");
        return R.ok(service.setCareRuleEnabled(code, enabled));
    }

    /**
     * 应用 AI 助手 propose 出来的 op pipeline。每个 op 翻译到 NotificationCenterService 的
     * update / upsert 调用。op 校验已经由 sidecar 完成,本端只做 case-by-case 分发。
     */
    @PostMapping("/apply-ops")
    @SaCheckPermission("system:manage")
    public R<Map<String, Object>> applyOps(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> ops = (List<Map<String, Object>>) body.get("ops");
        int applied = service.applyOps(ops);
        return R.ok(Map.of("applied", applied));
    }
}
