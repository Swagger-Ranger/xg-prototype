package com.xg.platform.platformadmin;

/**
 * Per-request thread-local for the resolved platform admin.
 * Set by {@link com.xg.platform.platformadmin.PlatformAuthFilter} after a
 * successful token lookup, cleared in the same filter's finally block.
 */
public final class PlatformAdminContext {

    private static final ThreadLocal<Long> ADMIN_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> USERNAME = new ThreadLocal<>();

    private PlatformAdminContext() {}

    public static void set(Long adminId, String username) {
        ADMIN_ID.set(adminId);
        USERNAME.set(username);
    }

    public static Long getAdminId() {
        return ADMIN_ID.get();
    }

    public static String getUsername() {
        return USERNAME.get();
    }

    public static void clear() {
        ADMIN_ID.remove();
        USERNAME.remove();
    }
}
