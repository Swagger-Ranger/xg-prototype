package com.xg.platform.platformaudit.service;

import com.xg.platform.platformaudit.mapper.PlatformAuditLogMapper;
import com.xg.platform.platformaudit.model.PlatformAuditLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Records platform-admin write operations. Writes are best-effort: failures
 * are logged but never propagated, so the audit pipeline can never block the
 * underlying business action.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlatformAuditService {

    private final PlatformAuditLogMapper mapper;

    /**
     * Writes in a brand-new transaction so a rollback of the caller's
     * transaction (e.g. login.fail throwing INVALID_CREDENTIALS) cannot drag
     * the audit row down with it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(Long adminId, String adminUsername, String action,
                    String targetType, String targetId, String description,
                    Map<String, Object> beforeData, Map<String, Object> afterData,
                    String ipAddress, String userAgent) {
        try {
            PlatformAuditLog row = new PlatformAuditLog();
            row.setAdminId(adminId);
            row.setAdminUsername(adminUsername);
            row.setAction(action);
            row.setTargetType(targetType);
            row.setTargetId(targetId);
            row.setDescription(description);
            row.setBeforeData(beforeData);
            row.setAfterData(afterData);
            row.setIpAddress(ipAddress);
            row.setUserAgent(userAgent);
            row.setCreatedAt(OffsetDateTime.now());
            mapper.insert(row);
        } catch (Exception e) {
            log.warn("Failed to write platform_audit_log action={} target={}/{}",
                    action, targetType, targetId, e);
        }
    }
}
