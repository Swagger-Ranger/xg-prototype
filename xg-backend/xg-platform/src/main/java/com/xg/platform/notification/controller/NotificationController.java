package com.xg.platform.notification.controller;

import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import com.xg.platform.notification.vo.MyNotificationVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/api/v1/notifications/my")
    public R<PageResult<MyNotificationVO>> listMyNotifications(PageQuery query) {
        return R.ok(notificationService.listMyNotifications(CurrentUser.id(), query));
    }

    @GetMapping("/api/v1/notifications/unread-count")
    public R<Long> countUnread() {
        return R.ok(notificationService.countUnread(CurrentUser.id()));
    }

    @PutMapping("/api/v1/notifications/{id}/read")
    public R<Void> markRead(@PathVariable Long id) {
        notificationService.markRead(CurrentUser.id(), id);
        return R.ok();
    }

    @PutMapping("/api/v1/notifications/{id}/confirm")
    public R<Void> confirm(@PathVariable Long id) {
        notificationService.confirm(CurrentUser.id(), id);
        return R.ok();
    }

    @PostMapping("/internal/v1/notifications/send")
    public R<Long> send(@RequestBody SendNotificationRequest req) {
        Long notificationId = notificationService.send(req);
        return R.ok(notificationId);
    }
}
