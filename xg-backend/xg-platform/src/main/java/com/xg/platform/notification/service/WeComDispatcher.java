package com.xg.platform.notification.service;

import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class WeComDispatcher implements ChannelDispatcher {

    @Override
    public String channel() {
        return "wecom";
    }

    @Override
    public void dispatch(Notification notification, NotificationRecipient recipient) {
        // TODO: integrate WeCom application message API
        log.info("WeCom notification {} -> user {} (stub, not yet sent)",
                notification.getId(), recipient.getUserId());
        recipient.setStatus("sent");
    }
}
