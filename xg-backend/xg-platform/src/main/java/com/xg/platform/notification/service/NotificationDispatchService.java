package com.xg.platform.notification.service;

import com.xg.platform.notification.mapper.NotificationRecipientMapper;
import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDispatchService {

    private final NotificationRecipientMapper recipientMapper;
    private final List<ChannelDispatcher> dispatchers;

    @Async("notificationTaskExecutor")
    public void dispatchAsync(Notification notification, List<NotificationRecipient> recipients) {
        Map<String, ChannelDispatcher> dispatcherMap = dispatchers.stream()
                .collect(Collectors.toMap(ChannelDispatcher::channel, Function.identity()));

        for (NotificationRecipient recipient : recipients) {
            ChannelDispatcher dispatcher = dispatcherMap.get(recipient.getChannel());
            if (dispatcher == null) {
                log.warn("No dispatcher for channel '{}', skipping recipient {}", recipient.getChannel(), recipient.getId());
                continue;
            }
            try {
                dispatcher.dispatch(notification, recipient);
            } catch (Exception e) {
                log.warn("Dispatch failed for recipient {} channel {}: {}", recipient.getId(), recipient.getChannel(), e.getMessage());
                recipient.setStatus("failed");
                recipient.setLastError(e.getMessage());
            }
            recipientMapper.updateById(recipient);
        }
    }
}
