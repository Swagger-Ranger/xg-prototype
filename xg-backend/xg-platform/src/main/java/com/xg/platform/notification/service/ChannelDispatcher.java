package com.xg.platform.notification.service;

import com.xg.platform.notification.model.Notification;
import com.xg.platform.notification.model.NotificationRecipient;

public interface ChannelDispatcher {

    String channel();

    void dispatch(Notification notification, NotificationRecipient recipient);
}
