package com.xg.platform.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.notification.mapper.NotificationPreferenceMapper;
import com.xg.platform.notification.mapper.NotificationTemplateMapper;
import com.xg.platform.notification.model.NotificationPreference;
import com.xg.platform.notification.model.NotificationTemplate;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.recipient.RecipientResolver;
import com.xg.platform.notification.recipient.ResolvedRecipient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 通知中心路由层(轨 2)。把"业务事件 → 模板 + 偏好 → 投递"集中到一个出口,
 * 业务侧只关心"我要按 LEAVE_APPROVED 模板通知谁",不再硬编码文案 / 渠道。
 *
 * <p>NotificationExecutor(轨 1,YAML 节点级)继续存在 — 那条路适合在工作流
 * 流程图上能看到的内嵌通知;轨 2 适合全局规则、流程外、关怀类。两条路通过
 * notification 表的 (source_type, source_id, template_code) 唯一索引去重,
 * 新代码不破坏老 YAML。
 *
 * <p>偏好查找顺序:user 级 → role 级 → tmpl.default_channels。muted=true 整模板
 * 静默(返回空 channels,Orchestrator 直接放弃发送)。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationOrchestrator {

    private static final Pattern VAR_PATTERN = Pattern.compile("\\{\\{\\s*(\\w+)\\s*}}");

    private final NotificationTemplateMapper templateMapper;
    private final NotificationPreferenceMapper preferenceMapper;
    private final NotificationService notificationService;
    private final RecipientResolver recipientResolver;

    /**
     * 按模板发通知。收件人由模板的 recipients JSONB 配置决定(管理员可改),
     * 业务侧只传 ctx(申请人 / 当前审批人 等)给 RecipientResolver 解析。
     *
     * <p>同 (sourceType, sourceId, templateCode) 重复触发会被唯一索引拦掉,
     * Orchestrator 吞 DuplicateKeyException 不再抛。
     *
     * @return 写入 notification.id;被去重 / 模板缺失 / 全员静默 / 解析后无收件人时返回 null。
     */
    public Long send(String templateCode, String sourceType, Long sourceId,
                     RecipientContext ctx, Map<String, Object> vars) {
        if (templateCode == null || ctx == null) return null;

        NotificationTemplate tmpl = findTemplate(templateCode);
        if (tmpl == null || Boolean.FALSE.equals(tmpl.getEnabled())) {
            log.debug("Notification template '{}' missing or disabled, skip", templateCode);
            return null;
        }

        // 解析模板配的 recipients → 实际用户列表(去重 + cc 标记)
        List<ResolvedRecipient> recipients = recipientResolver.resolve(tmpl.getRecipients(), ctx);
        if (recipients.isEmpty()) {
            log.info("Template {} resolved to zero recipients (source={}/{}); ctx may lack required fields",
                    templateCode, sourceType, sourceId);
            return null;
        }

        String title = render(tmpl.getTitleTmpl(), vars);
        String body = render(tmpl.getBodyTmpl(), vars);

        // 按渠道集合分组(同组共用一条 notification 记录,扇出 recipient)
        Map<List<String>, List<Long>> byChannels = new HashMap<>();
        for (ResolvedRecipient r : recipients) {
            List<String> channels = resolveChannels(tmpl, r.roleCode());
            if (channels == null || channels.isEmpty()) continue;
            byChannels.computeIfAbsent(channels, k -> new ArrayList<>()).add(r.userId());
        }
        if (byChannels.isEmpty()) {
            log.info("All recipients muted for template {} source={}/{}", templateCode, sourceType, sourceId);
            return null;
        }

        Long firstId = null;
        for (Map.Entry<List<String>, List<Long>> e : byChannels.entrySet()) {
            SendNotificationRequest req = new SendNotificationRequest();
            req.setTitle(title);
            req.setContent(body);
            req.setLevel(tmpl.getDefaultLevel() != null ? tmpl.getDefaultLevel() : "normal");
            req.setSourceType(sourceType);
            req.setSourceId(sourceId);
            req.setRecipientUserIds(e.getValue());
            req.setChannels(e.getKey());
            req.setTemplateCode(templateCode);
            try {
                Long id = notificationService.send(req);
                if (firstId == null) firstId = id;
            } catch (DuplicateKeyException dup) {
                log.info("Notification dedup hit (dual-track): template={} source={}/{}",
                        templateCode, sourceType, sourceId);
            } catch (Exception ex) {
                log.warn("Orchestrator send failed: template={} source={}/{}: {}",
                        templateCode, sourceType, sourceId, ex.getMessage());
            }
        }
        return firstId;
    }

    /**
     * Ad-hoc 广播专用入口 — 业务侧 UI 现拟标题 / 正文 / 收件人 / 渠道,
     * 不走 template 也不参与 (source_type, source_id, template_code) 双轨去重。
     *
     * <p>为什么不复用 {@link #send}:
     * <ul>
     *   <li>template-driven 收件人解析:广播场景由 controller 已经做了权限收口</li>
     *   <li>双轨去重:同一申请短时间内多条 ad-hoc 通知是合法语义,不该被静默吞掉</li>
     * </ul>
     * 为什么还要走 Orchestrator:统一收口"通知由谁发"的入口,
     * 业务侧不允许直接调 {@link NotificationService#send} 是为了防止
     * 偏好 / 模板 / 审计被绕过;ad-hoc 也属于"由 Orchestrator 决定怎么落"。
     *
     * @return notification.id;recipients 空 / channels 空时返回 null,不报错
     */
    public Long sendAdhoc(String sourceType, Long sourceId,
                          List<Long> recipientUserIds, List<String> channels,
                          String title, String body, String level, Long senderId) {
        if (recipientUserIds == null || recipientUserIds.isEmpty()) return null;
        if (channels == null || channels.isEmpty()) channels = List.of("in_app");
        SendNotificationRequest req = new SendNotificationRequest();
        req.setSourceType(sourceType);
        req.setSourceId(sourceId);
        req.setRecipientUserIds(recipientUserIds);
        req.setChannels(channels);
        req.setTitle(title);
        req.setContent(body);
        req.setLevel(level != null && !level.isBlank() ? level : "normal");
        req.setSenderId(senderId);
        // 显式不设 templateCode:让 uq_notification_source_template 部分唯一索引
        // (WHERE template_code IS NOT NULL) 不参与,允许同一 source 多次 ad-hoc 广播。
        return notificationService.send(req);
    }

    private NotificationTemplate findTemplate(String code) {
        return templateMapper.selectOne(
                new LambdaQueryWrapper<NotificationTemplate>()
                        .eq(NotificationTemplate::getTenantId, currentTenantId())
                        .eq(NotificationTemplate::getCode, code)
                        .last("LIMIT 1"));
    }

    /**
     * Resolve channels for a recipient: user pref → role pref → tmpl default.
     * P0 只走 role / default(user 级 P1 再做),保持调用面简单。
     */
    private List<String> resolveChannels(NotificationTemplate tmpl, String roleCode) {
        if (roleCode != null && !roleCode.isBlank()) {
            NotificationPreference pref = preferenceMapper.selectOne(
                    new LambdaQueryWrapper<NotificationPreference>()
                            .eq(NotificationPreference::getTenantId, currentTenantId())
                            .eq(NotificationPreference::getScopeType, "role")
                            .eq(NotificationPreference::getScopeValue, roleCode)
                            .eq(NotificationPreference::getTemplateCode, tmpl.getCode())
                            .last("LIMIT 1"));
            if (pref != null) {
                if (Boolean.TRUE.equals(pref.getMuted())) return List.of();
                return pref.getChannels();
            }
        }
        return tmpl.getDefaultChannels();
    }

    /** 极简模板渲染:{{var}} → vars.get("var")。缺失变量保留原占位,方便排错。 */
    private static String render(String template, Map<String, Object> vars) {
        if (template == null || template.isEmpty()) return template;
        if (vars == null || vars.isEmpty()) return template;
        Matcher m = VAR_PATTERN.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            Object v = vars.get(m.group(1));
            String replacement = (v == null) ? m.group(0) : Matcher.quoteReplacement(v.toString());
            m.appendReplacement(sb, replacement);
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }
}
