package com.xg.platform.care.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.xg.common.base.R;
import com.xg.platform.care.dto.RuleToggleRequest;
import com.xg.platform.care.dto.SeverityOffsetRequest;
import com.xg.platform.care.service.CareRuleConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 规则运维端点（PRD §6.3 / §15.4）。P1 学校侧只能启停 / 全局偏移 / 看效果报表，
 * 不能改阈值 / DSL / 版本回滚。
 *
 * <p>权限沿用 {@code alert:rule:manage}（college_admin / school_admin 持有）：
 * 主动关怀替代旧 alert，"规则管理"是同一概念能力，复用既有权限位，
 * 不新增权限 / 不另做 seed。
 */
@RestController
@RequiredArgsConstructor
@SaCheckPermission("alert:rule:manage")
public class CareRuleAdminController {

    private final CareRuleConfigService ruleConfigService;

    /** 规则列表 + 启停态 + 规则集版本 / 下次更新 / 当前严重度偏移。 */
    @GetMapping("/api/v1/care/rules")
    public R<Map<String, Object>> listRules() {
        return R.ok(ruleConfigService.listRules());
    }

    /** 启停单条规则。 */
    @PostMapping("/api/v1/care/rules/{ruleId}/toggle")
    public R<Void> toggle(@PathVariable String ruleId,
                          @Valid @RequestBody RuleToggleRequest req) {
        ruleConfigService.toggle(ruleId, req.getEnabled());
        return R.ok();
    }

    /** 设全局严重度偏移（-1 / 0 / +1）。 */
    @PostMapping("/api/v1/care/rules/severity-offset")
    public R<Void> severityOffset(@Valid @RequestBody SeverityOffsetRequest req) {
        ruleConfigService.setSeverityOffset(req.getOffset());
        return R.ok();
    }

    /** 30 天规则效果报表 + 治理提示。 */
    @GetMapping("/api/v1/care/rules/effect-report")
    public R<Map<String, Object>> effectReport() {
        return R.ok(ruleConfigService.effectReport());
    }
}
