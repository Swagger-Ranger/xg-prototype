package com.xg.platform.notification.service;

import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class InAppDispatcher implements ChannelDispatcher {

    @Override
    public String channel() {
        return "in_app";
    }

    @Override
    public void dispatch(Notification notification, NotificationRecipient recipient) {
        // In-app: the recipient record IS the notification; just mark as sent
        log.debug("In-app notification {} delivered to user {}", notification.getId(), recipient.getUserId());
        recipient.setStatus("sent");
    }
}
