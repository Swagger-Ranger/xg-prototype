package com.xg.platform.care.service;

import cn.dev33.satoken.stp.StpUtil;

import java.util.List;

/**
 * 主动关怀管理视图的角色/范围与下钻配额（PRD §6.2 / §13.2）。
 *
 * <p>范围口径决策（P0）：dean / school_admin / 学工部部长都看<b>本校全部</b>
 * （当前 schema 整租户），不按学院收窄；本院收窄留 P1。跨校读数据靠 schema
 * 隔离 + 每条 SQL 显式 tenant_id，结构上不可能。
 *
 * <p>纯静态方法接收 roles 列表，便于单测；唯一不纯的 {@link #currentRoles()}
 * 包住 Sa-Token，由 service 取后传入纯方法。
 */
public final class CareAdminAccess {

    public static final String DEAN = "dean";                       // 院系领导
    public static final String SCHOOL_ADMIN = "school_admin";       // 校级管理员
    public static final String AFFAIRS_DIRECTOR = "student_affairs_director"; // 学工部部长
    public static final String SUPER_ADMIN = "super_admin";

    /** 校领导级（学工部部长 / 超管）下钻不限频，但全量审计。 */
    public static final int DRILL_UNLIMITED = Integer.MAX_VALUE;

    private CareAdminAccess() {}

    /** 当前登录用户角色（Sa-Token）。无 web 上下文返回空。 */
    public static List<String> currentRoles() {
        try {
            return StpUtil.getRoleList();
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 是否有管理视图权限（看本校汇总/超期/趋势/下钻）。 */
    public static boolean isManager(List<String> roles) {
        return roles.contains(DEAN) || roles.contains(SCHOOL_ADMIN)
                || roles.contains(AFFAIRS_DIRECTOR) || roles.contains(SUPER_ADMIN);
    }

    /**
     * 每日下钻额度（PRD §13.2）。多角色取最高档；非管理角色 0（不允许下钻）。
     * 校领导（学工部部长 / 超管）不限但全量审计。
     */
    public static int drillDailyLimit(List<String> roles) {
        if (roles.contains(SUPER_ADMIN) || roles.contains(AFFAIRS_DIRECTOR)) {
            return DRILL_UNLIMITED;
        }
        if (roles.contains(SCHOOL_ADMIN)) {
            return 50;
        }
        if (roles.contains(DEAN)) {
            return 20;
        }
        return 0;
    }

    /** 审计 actor_role：取最高权限角色 code（留痕用，避免写成模糊的 "system"）。 */
    public static String actorRole(List<String> roles) {
        if (roles.contains(SUPER_ADMIN)) return SUPER_ADMIN;
        if (roles.contains(AFFAIRS_DIRECTOR)) return AFFAIRS_DIRECTOR;
        if (roles.contains(SCHOOL_ADMIN)) return SCHOOL_ADMIN;
        if (roles.contains(DEAN)) return DEAN;
        return roles.isEmpty() ? "unknown" : roles.get(0);
    }
}
