package com.xg.platform.notification.service;

import lombok.Data;

import java.util.List;

@Data
public class SendNotificationRequest {

    private String title;
    private String content;

    /** normal / important / urgent */
    private String level;

    private String sourceType;
    private Long sourceId;

    /** in_app / miniprogram / wecom */
    private List<String> channels;

    private List<Long> recipientUserIds;
    private Boolean requireConfirm;
    private Long senderId;

    /** 触发模板码,Orchestrator 路径必填,YAML 路径留空 */
    private String templateCode;
}
