package com.xg.platform.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import com.xg.platform.notification.mapper.NotificationMapper;
import com.xg.platform.notification.mapper.NotificationRecipientMapper;
import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import com.xg.platform.notification.vo.MyNotificationVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationMapper notificationMapper;
    private final NotificationRecipientMapper recipientMapper;
    private final NotificationDispatchService dispatchService;
    private final StudentEventPublisher studentEventPublisher;

    /**
     * Create a notification and fan-out recipient records, then dispatch asynchronously.
     */
    @Transactional
    public Long send(SendNotificationRequest req) {
        Notification notification = new Notification();
        notification.setTenantId(TenantContext.getTenantId());
        notification.setTitle(req.getTitle());
        notification.setContent(req.getContent());
        notification.setLevel(req.getLevel() != null ? req.getLevel() : "normal");
        notification.setSourceType(req.getSourceType());
        notification.setSourceId(req.getSourceId());
        notification.setChannels(req.getChannels());
        notification.setRequireConfirm(req.getRequireConfirm() != null ? req.getRequireConfirm() : false);
        notification.setSenderId(req.getSenderId());
        notification.setCreatedBy(req.getSenderId());
        notification.setTemplateCode(req.getTemplateCode());
        notification.setCreatedAt(OffsetDateTime.now());
        notificationMapper.insert(notification);

        List<String> channels = req.getChannels() != null ? req.getChannels() : List.of("in_app");
        List<NotificationRecipient> recipients = new ArrayList<>();
        for (Long userId : req.getRecipientUserIds()) {
            for (String channel : channels) {
                NotificationRecipient recipient = new NotificationRecipient();
                recipient.setTenantId(notification.getTenantId());
                recipient.setNotificationId(notification.getId());
                recipient.setUserId(userId);
                recipient.setChannel(channel);
                recipient.setStatus("pending");
                recipient.setConfirmed(false);
                recipient.setRetryCount(0);
                recipient.setCreatedAt(OffsetDateTime.now());
                recipients.add(recipient);
            }
        }
        recipients.forEach(recipientMapper::insert);

        dispatchService.dispatchAsync(notification, recipients);
        return notification.getId();
    }

    public void markRead(Long userId, Long notificationId) {
        recipientMapper.update(null,
                new LambdaUpdateWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getNotificationId, notificationId)
                        .eq(NotificationRecipient::getChannel, "in_app")
                        .isNull(NotificationRecipient::getReadAt)
                        .set(NotificationRecipient::getReadAt, OffsetDateTime.now()));
    }

    public void confirm(Long userId, Long notificationId) {
        OffsetDateTime now = OffsetDateTime.now();
        int updated = recipientMapper.update(null,
                new LambdaUpdateWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getNotificationId, notificationId)
                        .eq(NotificationRecipient::getConfirmed, false)
                        .set(NotificationRecipient::getConfirmed, true)
                        .set(NotificationRecipient::getConfirmedAt, now));
        if (updated == 0) {
            return;
        }
        String level = "normal";
        long delayMinutes = 0L;
        try {
            Notification notification = notificationMapper.selectById(notificationId);
            if (notification != null) {
                if (notification.getLevel() != null) level = notification.getLevel();
                if (notification.getCreatedAt() != null) {
                    delayMinutes = Duration.between(notification.getCreatedAt(), now).toMinutes();
                }
            }
        } catch (Exception e) {
            log.warn("failed to load notification for event enrichment id={}", notificationId, e);
        }
        studentEventPublisher.publish(userId, StudentEventType.NOTIFICATION_CONFIRMED, "notification",
                Map.of(
                        "notification_id", notificationId,
                        "level", level,
                        "delay_minutes", delayMinutes
                ));
    }

    public PageResult<MyNotificationVO> listMyNotifications(Long userId, PageQuery query) {
        // Page the recipient table (one row per user × channel × notification),
        // then batch-fetch the underlying notification records to merge in the
        // title/content/level/source_* fields the front-end actually needs.
        // Filter to in_app since this endpoint feeds the in-app notification
        // center; mini-program / wecom rows have their own delivery paths.
        Page<NotificationRecipient> page = query.toPage();
        recipientMapper.selectPage(page,
                new LambdaQueryWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getChannel, "in_app")
                        .orderByDesc(NotificationRecipient::getCreatedAt));

        List<NotificationRecipient> recipients = page.getRecords();
        Map<Long, Notification> notifMap = batchLoadNotifications(recipients);

        List<MyNotificationVO> vos = new ArrayList<>(recipients.size());
        for (NotificationRecipient r : recipients) {
            Notification n = notifMap.get(r.getNotificationId());
            vos.add(toVO(r, n));
        }

        Page<MyNotificationVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        voPage.setRecords(vos);
        return PageResult.of(voPage);
    }

    private Map<Long, Notification> batchLoadNotifications(List<NotificationRecipient> recipients) {
        if (recipients.isEmpty()) return Collections.emptyMap();
        Set<Long> ids = recipients.stream()
                .map(NotificationRecipient::getNotificationId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) return Collections.emptyMap();
        List<Notification> rows = notificationMapper.selectBatchIds(ids);
        Map<Long, Notification> map = new HashMap<>(rows.size());
        for (Notification n : rows) map.put(n.getId(), n);
        return map;
    }

    private MyNotificationVO toVO(NotificationRecipient r, Notification n) {
        MyNotificationVO vo = new MyNotificationVO();
        vo.setId(r.getId());
        vo.setNotificationId(r.getNotificationId());
        vo.setRead(r.getReadAt() != null);
        vo.setReadAt(r.getReadAt());
        vo.setConfirmed(r.getConfirmed());
        vo.setConfirmedAt(r.getConfirmedAt());
        if (n != null) {
            vo.setTitle(n.getTitle());
            vo.setContent(n.getContent());
            vo.setLevel(n.getLevel());
            vo.setSourceType(n.getSourceType());
            vo.setSourceId(n.getSourceId());
            vo.setRequireConfirm(n.getRequireConfirm());
            vo.setCreatedAt(n.getCreatedAt());
        }
        // Fall back to the recipient's created_at if the notification record
        // is somehow missing (shouldn't happen with the FK in place).
        if (vo.getCreatedAt() == null) vo.setCreatedAt(r.getCreatedAt());
        return vo;
    }

    public long countUnread(Long userId) {
        return recipientMapper.selectCount(
                new LambdaQueryWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getChannel, "in_app")
                        .isNull(NotificationRecipient::getReadAt));
    }
}
