package com.xg.business.leave.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import com.xg.platform.notification.service.NotificationOrchestrator;
import com.xg.platform.notification.service.NotificationOrchestrator.Recipient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 销假改造 P0 之后的「自助 + 兜底」双轨实现。原来的 leave_return workflow
 * 已废弃(V086 disabled),所有销假路径都不再走工作流引擎。
 *
 * <p>三条路径:
 * <ol>
 *   <li><b>by-location</b> — 学生小程序 GPS 上报。距校园围栏中心 ≤ 半径
 *       立即 cancelled,return_source=gps;否则返回距离让前端引导。</li>
 *   <li><b>manual-apply / manual-review</b> — 学生兜底通道:GPS 不通时
 *       学生填理由 + 附件,辅导员单节点 yes/no 审一下。同意 → cancelled,
 *       return_source=manual_approve;拒绝 → 退回 approved。</li>
 *   <li><b>access-card</b>(P1)— 门禁系统 webhook,目前留空骨架。</li>
 * </ol>
 *
 * <p>校园围栏:存在 {@code public.tenant.config -> 'campusGeofence'} jsonb,
 * { centerLat, centerLng, radiusM } 三个数。缺失时 fallback 默认值,管理员
 * 在配置页改完会写回 tenant.config。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveReturnService {

    /** Fallback 围栏(重庆大学 A 区主楼附近 + 500m),管理员未配置时启用。 */
    private static final BigDecimal DEFAULT_LAT = new BigDecimal("29.5641");
    private static final BigDecimal DEFAULT_LNG = new BigDecimal("106.4623");
    private static final int DEFAULT_RADIUS_M = 500;

    /** 地球半径(米),haversine 用。 */
    private static final double EARTH_RADIUS_M = 6371000.0;

    private final LeaveRequestMapper leaveRequestMapper;
    private final StudentEventPublisher studentEventPublisher;
    private final NotificationOrchestrator notificationOrchestrator;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /* -------------------- by-location -------------------- */

    public record ReturnByLocationResult(
            boolean inFence,
            BigDecimal distanceMeters,
            int radiusMeters,
            BigDecimal centerLat,
            BigDecimal centerLng,
            LeaveRequest leave
    ) {}

    @Transactional
    public ReturnByLocationResult submitByLocation(Long leaveId, Long userId,
                                                    BigDecimal lat, BigDecimal lng,
                                                    OffsetDateTime capturedAt) {
        if (lat == null || lng == null) {
            throw new BizException("INVALID_LOCATION", "缺少 GPS 经纬度");
        }
        LeaveRequest leave = mustGet(leaveId);
        if (!"approved".equals(leave.getStatus())) {
            throw new BizException("INVALID_STATUS", "只能对已通过的请假发起销假");
        }
        Geofence g = readGeofence();
        double distM = haversineMeters(lat, lng, g.centerLat(), g.centerLng());
        BigDecimal distRounded = BigDecimal.valueOf(distM).setScale(1, RoundingMode.HALF_UP);

        leave.setReturnLatitude(lat);
        leave.setReturnLongitude(lng);
        leave.setReturnLocationAt(capturedAt != null ? capturedAt : OffsetDateTime.now());

        // 围栏关掉时 = 自助销假,学生点一下直接通过,不判定位置 / 不审核。
        // 仍然把 lat/lng 写进 leave_request 留作 audit(知道学生当时在哪点的)。
        // source=auto 跟 gps 区分,后台报表能看出哪条是有 GPS 判定的。
        boolean inFence;
        String source;
        if (!g.enabled()) {
            inFence = true;
            source = "auto";
        } else {
            inFence = distM <= g.radiusM();
            source = "gps";
        }
        if (inFence) {
            leave.setStatus("cancelled");
            leave.setReturnSource(source);
            leave.setCancelTime(OffsetDateTime.now());
            leave.setCancelledBy(userId);
            leaveRequestMapper.updateById(leave);
            studentEventPublisher.publish(leave.getStudentId(),
                    StudentEventType.LEAVE_CANCELLED, "leave", Map.of(
                            "leave_id", leave.getId(),
                            "source", source,
                            "distance_m", distRounded
                    ));
            log.info("Leave {} cancelled via {} (distance={}m, radius={}m, fence_enabled={})",
                    leaveId, source, distRounded, g.radiusM(), g.enabled());
            // 销假完成 → 走 Orchestrator (LEAVE_RETURNED 模板)。
            // GPS 自助 / 关闭围栏自助两种情况都触发,文案区分由 return_source_label 渲染。
            notifyReturned(leave, source);
        } else {
            // 不在围栏内:**不**改 status,只更新位置(给辅导员审计:学生在哪点的)
            leaveRequestMapper.updateById(leave);
            log.info("Leave {} GPS rejected: distance={}m exceeds radius {}m",
                    leaveId, distRounded, g.radiusM());
        }
        return new ReturnByLocationResult(inFence, distRounded, g.radiusM(),
                g.centerLat(), g.centerLng(), leave);
    }

    /* -------------------- manual-apply -------------------- */

    @Transactional
    public LeaveRequest applyManualReturn(Long leaveId, Long userId,
                                           String reason, List<Map<String, Object>> attachments) {
        if (reason == null || reason.isBlank()) {
            throw new BizException("INVALID_REASON", "请填写人工销假理由");
        }
        LeaveRequest leave = mustGet(leaveId);
        if (!"approved".equals(leave.getStatus())) {
            throw new BizException("INVALID_STATUS", "只能对已通过的请假发起人工销假");
        }
        leave.setStatus("pending_manual_return");
        leave.setManualReturnReason(reason.trim());
        leave.setManualReturnAttachments(serializeAttachments(attachments));
        leave.setManualReturnSubmittedAt(OffsetDateTime.now());
        leaveRequestMapper.updateById(leave);

        studentEventPublisher.publish(leave.getStudentId(),
                StudentEventType.LEAVE_CANCELLED, "leave", Map.of(
                        "leave_id", leave.getId(),
                        "source", "manual_apply"
                ));
        log.info("Leave {} 人工销假申请 by user {}", leaveId, userId);
        return leave;
    }

    /* -------------------- manual-review -------------------- */

    @Transactional
    public LeaveRequest reviewManualReturn(Long leaveId, Long counselorId, boolean approve) {
        LeaveRequest leave = mustGet(leaveId);
        if (!"pending_manual_return".equals(leave.getStatus())) {
            throw new BizException("INVALID_STATUS", "该申请不在人工销假待审状态");
        }
        if (approve) {
            leave.setStatus("cancelled");
            leave.setReturnSource("manual_approve");
            leave.setCancelTime(OffsetDateTime.now());
            leave.setCancelledBy(counselorId);
        } else {
            // 退回 approved,假期还在,学生可以继续 GPS 或重新申请
            leave.setStatus("approved");
            // 不清空 manual_return_reason / attachments,作历史保留
        }
        leaveRequestMapper.updateById(leave);

        studentEventPublisher.publish(leave.getStudentId(),
                StudentEventType.LEAVE_CANCELLED, "leave", Map.of(
                        "leave_id", leave.getId(),
                        "source", approve ? "manual_approve" : "manual_reject",
                        "reviewed_by", counselorId
                ));
        log.info("Leave {} 人工销假 reviewed by {}: {}", leaveId, counselorId,
                approve ? "approved" : "rejected");
        if (approve) {
            // 销假完成 → 走 Orchestrator;reject 路径销假被驳回不在 P0 模板清单里
            notifyReturned(leave, "manual_approve");
        }
        return leave;
    }

    /** 销假完成统一通知出口:走 Orchestrator (LEAVE_RETURNED 模板),失败不阻塞业务。 */
    private void notifyReturned(LeaveRequest leave, String source) {
        if (leave.getStudentId() == null) return;
        Map<String, Object> vars = Map.of(
                "leave_type_name", leave.getLeaveTypeName() != null ? leave.getLeaveTypeName() : "请假",
                "return_source_label", switch (source) {
                    case "gps" -> "GPS 自助销假";
                    case "auto" -> "自助销假";
                    case "manual_approve" -> "辅导员审核通过";
                    default -> "审批通过";
                });
        try {
            notificationOrchestrator.send("LEAVE_RETURNED", "leave", leave.getId(),
                    List.of(Recipient.of(leave.getStudentId(), "student")), vars);
        } catch (Exception e) {
            log.warn("orchestrator send LEAVE_RETURNED failed for leave {}: {}", leave.getId(), e.getMessage());
        }
    }

    /* -------------------- 校园围栏读 / 写 -------------------- */

    /**
     * 销假地理围栏配置。
     *   - enabled=false 时整个 GPS 销假功能关闭,学生只能走人工销假兜底通道,
     *     submitByLocation 会直接返回 inFence=false,不再判断距离。
     */
    public record Geofence(BigDecimal centerLat, BigDecimal centerLng, int radiusM, boolean enabled) {}

    public Geofence readGeofence() {
        String tenantId = currentTenantId();
        try {
            String json = jdbc.queryForObject(
                    "SELECT config::text FROM public.tenant WHERE id = ?",
                    String.class, tenantId);
            if (json == null || json.isBlank()) return defaultGeofence();
            @SuppressWarnings("unchecked")
            Map<String, Object> cfg = objectMapper.readValue(json, Map.class);
            Object g = cfg.get("campusGeofence");
            if (!(g instanceof Map<?, ?> gm)) return defaultGeofence();
            BigDecimal lat = toBig(gm.get("centerLat"));
            BigDecimal lng = toBig(gm.get("centerLng"));
            Integer radius = toInt(gm.get("radiusM"));
            if (lat == null || lng == null || radius == null || radius <= 0) {
                return defaultGeofence();
            }
            // enabled 缺失时默认 true(老数据兼容);只有显式 false 才视为关闭
            Object enabledObj = gm.get("enabled");
            boolean enabled = !(enabledObj instanceof Boolean) || (Boolean) enabledObj;
            return new Geofence(lat, lng, radius, enabled);
        } catch (EmptyResultDataAccessException e) {
            return defaultGeofence();
        } catch (Exception e) {
            log.warn("Failed to read campus geofence, falling back to default: {}", e.getMessage());
            return defaultGeofence();
        }
    }

    @Transactional
    public Geofence writeGeofence(BigDecimal centerLat, BigDecimal centerLng, int radiusM, boolean enabled) {
        if (centerLat == null || centerLng == null) {
            throw new BizException("INVALID_GEOFENCE", "围栏中心经纬度不能为空");
        }
        if (radiusM <= 0 || radiusM > 100000) {
            throw new BizException("INVALID_GEOFENCE", "围栏半径需在 1-100000 米之间");
        }
        String tenantId = currentTenantId();
        try {
            // 用 jsonb_set 保留其他键。tenant.config 可能为 null,先 COALESCE。
            String fragment = objectMapper.writeValueAsString(Map.of(
                    "centerLat", centerLat,
                    "centerLng", centerLng,
                    "radiusM", radiusM,
                    "enabled", enabled
            ));
            int affected = jdbc.update("""
                    UPDATE public.tenant
                       SET config = jsonb_set(COALESCE(config, '{}'::jsonb),
                                              '{campusGeofence}',
                                              ?::jsonb,
                                              true),
                           updated_at = NOW()
                     WHERE id = ?
                    """, fragment, tenantId);
            if (affected == 0) throw new BizException("TENANT_NOT_FOUND", "租户不存在");
            log.info("Updated campus geofence for tenant {}: {}", tenantId, fragment);
            return new Geofence(centerLat, centerLng, radiusM, enabled);
        } catch (BizException biz) {
            throw biz;
        } catch (Exception e) {
            log.error("Failed to write campus geofence: {}", e.getMessage(), e);
            throw new BizException("GEOFENCE_WRITE_FAILED", "保存围栏失败:" + e.getMessage());
        }
    }

    /* -------------------- helpers -------------------- */

    private LeaveRequest mustGet(Long leaveId) {
        LeaveRequest leave = leaveRequestMapper.selectById(leaveId);
        if (leave == null) throw new BizException("LEAVE_NOT_FOUND", "请假申请不存在");
        return leave;
    }

    private String serializeAttachments(List<Map<String, Object>> attachments) {
        if (attachments == null || attachments.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(attachments);
        } catch (Exception e) {
            throw new BizException("INVALID_ATTACHMENTS", "附件格式异常:" + e.getMessage());
        }
    }

    private Geofence defaultGeofence() {
        return new Geofence(DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_M, true);
    }

    private static BigDecimal toBig(Object o) {
        if (o == null) return null;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try { return new BigDecimal(o.toString()); } catch (Exception e) { return null; }
    }

    private static Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.valueOf(o.toString()); } catch (Exception e) { return null; }
    }

    private String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }

    /** Haversine — 输入两点经纬度(度),输出地表距离(米)。 */
    private static double haversineMeters(BigDecimal lat1, BigDecimal lng1,
                                           BigDecimal lat2, BigDecimal lng2) {
        double phi1 = Math.toRadians(lat1.doubleValue());
        double phi2 = Math.toRadians(lat2.doubleValue());
        double dPhi = Math.toRadians(lat2.doubleValue() - lat1.doubleValue());
        double dLambda = Math.toRadians(lng2.doubleValue() - lng1.doubleValue());
        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                + Math.cos(phi1) * Math.cos(phi2)
                * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_M * c;
    }
}
