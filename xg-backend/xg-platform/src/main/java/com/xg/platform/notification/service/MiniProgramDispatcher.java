package com.xg.platform.notification.service;

import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MiniProgramDispatcher implements ChannelDispatcher {

    @Override
    public String channel() {
        return "miniprogram";
    }

    @Override
    public void dispatch(Notification notification, NotificationRecipient recipient) {
        // TODO: integrate WeChat miniprogram template message API
        log.info("MiniProgram notification {} -> user {} (stub, not yet sent)",
                notification.getId(), recipient.getUserId());
        recipient.setStatus("sent");
    }
}
