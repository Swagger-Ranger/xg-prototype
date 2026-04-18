package com.xg.platform.notification.controller;

import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.notification.model.NotificationRecipient;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/api/v1/notifications/my")
    public R<PageResult<NotificationRecipient>> listMyNotifications(
            PageQuery query,
            HttpServletRequest request) {
        Long userId = extractUserId(request);
        return R.ok(notificationService.listMyNotifications(userId, query));
    }

    @GetMapping("/api/v1/notifications/unread-count")
    public R<Long> countUnread(HttpServletRequest request) {
        Long userId = extractUserId(request);
        return R.ok(notificationService.countUnread(userId));
    }

    @PutMapping("/api/v1/notifications/{id}/read")
    public R<Void> markRead(@PathVariable Long id, HttpServletRequest request) {
        Long userId = extractUserId(request);
        notificationService.markRead(userId, id);
        return R.ok();
    }

    @PutMapping("/api/v1/notifications/{id}/confirm")
    public R<Void> confirm(@PathVariable Long id, HttpServletRequest request) {
        Long userId = extractUserId(request);
        notificationService.confirm(userId, id);
        return R.ok();
    }

    @PostMapping("/internal/v1/notifications/send")
    public R<Long> send(@RequestBody SendNotificationRequest req) {
        Long notificationId = notificationService.send(req);
        return R.ok(notificationId);
    }

    private Long extractUserId(HttpServletRequest request) {
        String header = request.getHeader("X-User-Id");
        if (header == null || header.isBlank()) {
            throw new IllegalArgumentException("Missing X-User-Id header");
        }
        return Long.parseLong(header);
    }
}
