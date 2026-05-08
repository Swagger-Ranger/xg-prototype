package com.xg.platform.notification.recipient;

/**
 * RecipientTypeResolver 输出的单个"已解析收件人":user_id + 可选 role_code(用于
 * Orchestrator 查角色级偏好覆盖)+ cc 标记(P0 仅作 UI 标签,投递不分主送 / 抄送)。
 */
public record ResolvedRecipient(Long userId, String roleCode, boolean cc) {
    public static ResolvedRecipient main(Long userId, String roleCode) {
        return new ResolvedRecipient(userId, roleCode, false);
    }
    public static ResolvedRecipient cc(Long userId, String roleCode) {
        return new ResolvedRecipient(userId, roleCode, true);
    }
}
