package com.xg.platform.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.notification.mapper.CareRuleMapper;
import com.xg.platform.notification.mapper.NotificationPreferenceMapper;
import com.xg.platform.notification.mapper.NotificationTemplateMapper;
import com.xg.platform.notification.model.CareRule;
import com.xg.platform.notification.model.NotificationPreference;
import com.xg.platform.notification.model.NotificationTemplate;
import com.xg.platform.notification.recipient.RecipientType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 通知中心配置面板的后端 — 模板 / 偏好 / 关怀规则三类管理操作。
 * 走 system:manage 权限,Controller 层做权限拦截。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationCenterService {

    private static final Set<String> ALLOWED_CHANNELS = Set.of("in_app", "miniprogram", "wecom");
    private static final Set<String> ALLOWED_LEVELS = Set.of("normal", "important", "urgent");

    private final NotificationTemplateMapper templateMapper;
    private final NotificationPreferenceMapper preferenceMapper;
    private final CareRuleMapper careRuleMapper;
    private final ObjectMapper objectMapper;

    /* ───────── 模板 ───────── */

    public List<NotificationTemplate> listTemplates() {
        return templateMapper.selectList(
                new LambdaQueryWrapper<NotificationTemplate>()
                        .eq(NotificationTemplate::getTenantId, currentTenantId())
                        .orderByAsc(NotificationTemplate::getCategory)
                        .orderByAsc(NotificationTemplate::getId));
    }

    @Transactional
    public NotificationTemplate updateTemplate(String code, NotificationTemplate patch) {
        NotificationTemplate row = mustGetTemplate(code);
        if (patch.getTitleTmpl() != null) row.setTitleTmpl(patch.getTitleTmpl());
        if (patch.getBodyTmpl() != null) row.setBodyTmpl(patch.getBodyTmpl());
        if (patch.getDefaultChannels() != null) {
            validateChannels(patch.getDefaultChannels());
            row.setDefaultChannels(patch.getDefaultChannels());
        }
        if (patch.getDefaultLevel() != null) {
            if (!ALLOWED_LEVELS.contains(patch.getDefaultLevel())) {
                throw new BizException("INVALID_LEVEL", "level 必须是 normal / important / urgent");
            }
            row.setDefaultLevel(patch.getDefaultLevel());
        }
        if (patch.getEnabled() != null) row.setEnabled(patch.getEnabled());
        if (patch.getDescription() != null) row.setDescription(patch.getDescription());
        if (patch.getRecipients() != null) {
            validateRecipientsJson(patch.getRecipients());
            row.setRecipients(patch.getRecipients());
        }
        row.setUpdatedAt(OffsetDateTime.now());
        templateMapper.updateById(row);
        log.info("notification template {} updated", code);
        return row;
    }

    /* ───────── 偏好 ───────── */

    public List<NotificationPreference> listPreferences(String scopeType) {
        LambdaQueryWrapper<NotificationPreference> q = new LambdaQueryWrapper<>();
        q.eq(NotificationPreference::getTenantId, currentTenantId());
        if (scopeType != null && !scopeType.isBlank()) {
            q.eq(NotificationPreference::getScopeType, scopeType);
        }
        return preferenceMapper.selectList(q);
    }

    /**
     * Upsert 偏好(scope_type, scope_value, template_code 三元组唯一)。
     * channels=空 + muted=true 等价于"整模板静默"。
     */
    @Transactional
    public NotificationPreference upsertPreference(String scopeType, String scopeValue,
                                                    String templateCode, List<String> channels, Boolean muted) {
        if (scopeType == null || (!"role".equals(scopeType) && !"user".equals(scopeType))) {
            throw new BizException("INVALID_SCOPE", "scope_type 必须是 role / user");
        }
        if (scopeValue == null || scopeValue.isBlank()) {
            throw new BizException("INVALID_SCOPE_VALUE", "scope_value 不能为空");
        }
        if (templateCode == null || templateCode.isBlank()) {
            throw new BizException("INVALID_TEMPLATE", "template_code 不能为空");
        }
        // 校验模板存在(避免脏配置)
        if (templateMapper.selectCount(new LambdaQueryWrapper<NotificationTemplate>()
                .eq(NotificationTemplate::getTenantId, currentTenantId())
                .eq(NotificationTemplate::getCode, templateCode)) == 0) {
            throw new BizException("TEMPLATE_NOT_FOUND", "模板不存在: " + templateCode);
        }
        if (channels != null) validateChannels(channels);

        NotificationPreference existing = preferenceMapper.selectOne(
                new LambdaQueryWrapper<NotificationPreference>()
                        .eq(NotificationPreference::getTenantId, currentTenantId())
                        .eq(NotificationPreference::getScopeType, scopeType)
                        .eq(NotificationPreference::getScopeValue, scopeValue)
                        .eq(NotificationPreference::getTemplateCode, templateCode)
                        .last("LIMIT 1"));
        if (existing == null) {
            NotificationPreference row = new NotificationPreference();
            row.setTenantId(currentTenantId());
            row.setScopeType(scopeType);
            row.setScopeValue(scopeValue);
            row.setTemplateCode(templateCode);
            row.setChannels(channels != null ? channels : List.of());
            row.setMuted(Boolean.TRUE.equals(muted));
            row.setCreatedAt(OffsetDateTime.now());
            row.setUpdatedAt(OffsetDateTime.now());
            preferenceMapper.insert(row);
            return row;
        } else {
            if (channels != null) existing.setChannels(channels);
            if (muted != null) existing.setMuted(muted);
            existing.setUpdatedAt(OffsetDateTime.now());
            preferenceMapper.updateById(existing);
            return existing;
        }
    }

    /* ───────── 关怀规则 ───────── */

    public List<CareRule> listCareRules() {
        return careRuleMapper.selectList(
                new LambdaQueryWrapper<CareRule>()
                        .eq(CareRule::getTenantId, currentTenantId())
                        .orderByAsc(CareRule::getId));
    }

    /** P0 仅支持 enable / disable;增删改字段留 P1。 */
    @Transactional
    public CareRule setCareRuleEnabled(String code, boolean enabled) {
        CareRule rule = careRuleMapper.selectOne(
                new LambdaQueryWrapper<CareRule>()
                        .eq(CareRule::getTenantId, currentTenantId())
                        .eq(CareRule::getCode, code)
                        .last("LIMIT 1"));
        if (rule == null) throw new BizException("CARE_RULE_NOT_FOUND", "关怀规则不存在: " + code);
        rule.setEnabled(enabled);
        rule.setUpdatedAt(OffsetDateTime.now());
        careRuleMapper.updateById(rule);
        log.info("care_rule {} enabled={}", code, enabled);
        return rule;
    }

    /* ───────── AI op apply ───────── */

    /**
     * 应用 AI propose 出来的 op pipeline。每个 op 翻译到 update / upsert 调用。
     * sidecar 已经做过字段白名单校验,这里只做 case 分发 + 异常容错。
     *
     * @return 实际成功 apply 的 op 数(失败的会跳过 + 日志,不抛断后续)
     */
    @Transactional
    public int applyOps(List<Map<String, Object>> ops) {
        if (ops == null || ops.isEmpty()) return 0;
        int applied = 0;
        for (Map<String, Object> op : ops) {
            try {
                String type = (String) op.get("op");
                if (type == null) continue;
                switch (type) {
                    case "set_template_enabled" -> {
                        NotificationTemplate patch = new NotificationTemplate();
                        patch.setEnabled((Boolean) op.get("enabled"));
                        updateTemplate((String) op.get("code"), patch);
                    }
                    case "set_template_channels" -> {
                        @SuppressWarnings("unchecked")
                        List<String> channels = (List<String>) op.get("channels");
                        NotificationTemplate patch = new NotificationTemplate();
                        patch.setDefaultChannels(channels);
                        updateTemplate((String) op.get("code"), patch);
                    }
                    case "set_template_level" -> {
                        NotificationTemplate patch = new NotificationTemplate();
                        patch.setDefaultLevel((String) op.get("level"));
                        updateTemplate((String) op.get("code"), patch);
                    }
                    case "set_template_text" -> {
                        NotificationTemplate patch = new NotificationTemplate();
                        if (op.get("title") != null) patch.setTitleTmpl((String) op.get("title"));
                        if (op.get("body") != null) patch.setBodyTmpl((String) op.get("body"));
                        updateTemplate((String) op.get("code"), patch);
                    }
                    case "set_template_recipients" -> {
                        Object recipients = op.get("recipients");
                        if (recipients == null) {
                            log.warn("applyOps: set_template_recipients missing recipients, skip");
                            continue;
                        }
                        NotificationTemplate patch = new NotificationTemplate();
                        patch.setRecipients(objectMapper.writeValueAsString(recipients));
                        updateTemplate((String) op.get("code"), patch);
                    }
                    case "set_pref_channels" -> {
                        @SuppressWarnings("unchecked")
                        List<String> channels = (List<String>) op.get("channels");
                        Object mutedObj = op.get("muted");
                        Boolean muted = mutedObj instanceof Boolean ? (Boolean) mutedObj : null;
                        upsertPreference(
                                (String) op.get("scope_type"),
                                (String) op.get("scope_value"),
                                (String) op.get("template_code"),
                                channels,
                                muted);
                    }
                    default -> {
                        log.warn("applyOps: unknown op type '{}', skip", type);
                        continue;
                    }
                }
                applied++;
            } catch (Exception e) {
                log.warn("applyOps: op {} failed: {}", op, e.getMessage());
            }
        }
        log.info("applyOps: {} of {} ops applied", applied, ops.size());
        return applied;
    }

    /* ───────── helpers ───────── */

    private NotificationTemplate mustGetTemplate(String code) {
        NotificationTemplate row = templateMapper.selectOne(
                new LambdaQueryWrapper<NotificationTemplate>()
                        .eq(NotificationTemplate::getTenantId, currentTenantId())
                        .eq(NotificationTemplate::getCode, code)
                        .last("LIMIT 1"));
        if (row == null) throw new BizException("TEMPLATE_NOT_FOUND", "模板不存在: " + code);
        return row;
    }

    private void validateChannels(List<String> channels) {
        for (String c : channels) {
            if (!ALLOWED_CHANNELS.contains(c)) {
                throw new BizException("INVALID_CHANNEL", "不支持的渠道: " + c);
            }
        }
    }

    /** 校验 recipients JSONB 字面 — 必须是非空 array,每项 type 在 RecipientType 枚举内,
     *  static_user 必须带 user_id。sidecar 已校验,这里防御重写。 */
    private void validateRecipientsJson(String recipientsJson) {
        JsonNode node;
        try {
            node = objectMapper.readTree(recipientsJson);
        } catch (JsonProcessingException e) {
            throw new BizException("INVALID_RECIPIENTS", "recipients 不是合法 JSON");
        }
        if (!node.isArray() || node.isEmpty()) {
            throw new BizException("INVALID_RECIPIENTS", "recipients 必须为非空数组");
        }
        for (JsonNode r : node) {
            if (!r.isObject()) {
                throw new BizException("INVALID_RECIPIENTS", "recipients 每项必须是对象");
            }
            String type = r.path("type").asText(null);
            if (type == null || RecipientType.fromCode(type) == null) {
                throw new BizException("INVALID_RECIPIENTS", "不支持的收件人类型: " + type);
            }
            if ("static_user".equals(type) && r.path("user_id").asLong(0L) <= 0L) {
                throw new BizException("INVALID_RECIPIENTS", "static_user 必须带 user_id");
            }
        }
    }

    private String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }
}
