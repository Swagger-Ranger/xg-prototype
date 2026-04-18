package com.xg.platform.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.notification.mapper.NotificationMapper;
import com.xg.platform.notification.mapper.NotificationRecipientMapper;
import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationMapper notificationMapper;
    private final NotificationRecipientMapper recipientMapper;
    private final NotificationDispatchService dispatchService;

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
        recipientMapper.update(null,
                new LambdaUpdateWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getNotificationId, notificationId)
                        .set(NotificationRecipient::getConfirmed, true)
                        .set(NotificationRecipient::getConfirmedAt, OffsetDateTime.now()));
    }

    public PageResult<NotificationRecipient> listMyNotifications(Long userId, PageQuery query) {
        Page<NotificationRecipient> page = query.toPage();
        recipientMapper.selectPage(page,
                new LambdaQueryWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .orderByDesc(NotificationRecipient::getCreatedAt));
        return PageResult.of(page);
    }

    public long countUnread(Long userId) {
        return recipientMapper.selectCount(
                new LambdaQueryWrapper<NotificationRecipient>()
                        .eq(NotificationRecipient::getUserId, userId)
                        .eq(NotificationRecipient::getChannel, "in_app")
                        .isNull(NotificationRecipient::getReadAt));
    }
}
