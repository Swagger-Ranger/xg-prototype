package com.xg.business.checkin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.checkin.dto.CheckinQueryRequest;
import com.xg.business.checkin.dto.CreateActivityRequest;
import com.xg.business.checkin.dto.RollCallRequest;
import com.xg.business.checkin.dto.ScanCheckinRequest;
import com.xg.business.checkin.dto.SupplementRequest;
import com.xg.business.checkin.mapper.CheckinActivityMapper;
import com.xg.business.checkin.mapper.CheckinRecordMapper;
import com.xg.business.checkin.model.CheckinActivity;
import com.xg.business.checkin.model.CheckinRecord;
import com.xg.common.base.PageResult;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CheckinService {

    private final CheckinActivityMapper checkinActivityMapper;
    private final CheckinRecordMapper checkinRecordMapper;
    private final ObjectMapper objectMapper;
    private final StudentEventPublisher studentEventPublisher;

    @Transactional
    public CheckinActivity createActivity(CreateActivityRequest req, Long creatorId) {
        OffsetDateTime now = OffsetDateTime.now();

        CheckinActivity activity = new CheckinActivity();
        activity.setTitle(req.getTitle());
        activity.setCreatorId(creatorId);
        activity.setScopeOrgIds(toJson(req.getScopeOrgIds()));
        activity.setExpectedCount(0);
        activity.setCheckinMode(req.getCheckinMode() != null ? req.getCheckinMode() : "qr_scan");
        activity.setQrCodeSecret(UUID.randomUUID().toString().replace("-", ""));
        activity.setQrRefreshInterval(30);
        activity.setLateThresholdMinutes(req.getLateThresholdMinutes() != null ? req.getLateThresholdMinutes() : 5);
        activity.setStartTime(now);
        activity.setEndTime(now.plusMinutes(req.getDurationMinutes()));
        activity.setEnableCheckout(Boolean.TRUE.equals(req.getEnableCheckout()));
        if (Boolean.TRUE.equals(req.getEnableCheckout()) && req.getCheckoutDurationMinutes() != null) {
            activity.setCheckoutEndTime(now.plusMinutes(req.getDurationMinutes() + req.getCheckoutDurationMinutes()));
        }
        activity.setStatus("active");
        activity.setGeoFence(toJson(req.getGeoFence()));

        checkinActivityMapper.insert(activity);
        return activity;
    }

    public PageResult<CheckinActivity> myActivities(Long creatorId, CheckinQueryRequest query) {
        Page<CheckinActivity> page = query.toPage();
        LambdaQueryWrapper<CheckinActivity> wrapper = new LambdaQueryWrapper<CheckinActivity>()
                .eq(CheckinActivity::getCreatorId, creatorId)
                .eq(query.getStatus() != null, CheckinActivity::getStatus, query.getStatus())
                .orderByDesc(CheckinActivity::getCreatedAt);
        return PageResult.of(checkinActivityMapper.selectPage(page, wrapper));
    }

    public CheckinActivity getActivity(Long id) {
        CheckinActivity activity = checkinActivityMapper.selectById(id);
        if (activity == null) {
            throw CheckinErrorCode.ACTIVITY_NOT_FOUND.exception();
        }
        return activity;
    }

    public Map<String, Object> getQrCode(Long activityId, Long userId) {
        CheckinActivity activity = getActivity(activityId);

        long nowSeconds = System.currentTimeMillis() / 1000;
        long bucket = nowSeconds / activity.getQrRefreshInterval();
        String dataToSign = activityId + ":" + bucket;
        String hmac = computeHmac(dataToSign, activity.getQrCodeSecret());
        String payload = dataToSign + ":" + hmac;

        long signedCount = checkinRecordMapper.selectCount(
                new LambdaQueryWrapper<CheckinRecord>()
                        .eq(CheckinRecord::getActivityId, activityId)
                        .isNotNull(CheckinRecord::getCheckedInAt)
        );

        long expiresAt = (bucket + 1) * activity.getQrRefreshInterval();

        Map<String, Object> result = new HashMap<>();
        result.put("payload", payload);
        result.put("expires_at", expiresAt);
        result.put("activity_title", activity.getTitle());
        result.put("signed_count", signedCount);
        result.put("expected_count", activity.getExpectedCount());
        return result;
    }

    @Transactional
    public CheckinRecord scan(ScanCheckinRequest req, Long studentId) {
        CheckinActivity activity = getActivity(req.getActivityId());

        if (!"active".equals(activity.getStatus())) {
            throw CheckinErrorCode.ACTIVITY_NOT_ACTIVE.exception();
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (now.isAfter(activity.getEndTime())) {
            throw CheckinErrorCode.ACTIVITY_ENDED.exception();
        }

        validateQrPayload(req.getQrPayload(), activity);

        long existingCount = checkinRecordMapper.selectCount(
                new LambdaQueryWrapper<CheckinRecord>()
                        .eq(CheckinRecord::getActivityId, req.getActivityId())
                        .eq(CheckinRecord::getStudentId, studentId)
        );
        if (existingCount > 0) {
            throw CheckinErrorCode.ALREADY_SIGNED.exception();
        }

        String status = now.isAfter(activity.getStartTime().plusMinutes(activity.getLateThresholdMinutes()))
                ? "late" : "on_time";

        CheckinRecord record = new CheckinRecord();
        record.setTenantId(TenantContext.getTenantId());
        record.setActivityId(req.getActivityId());
        record.setStudentId(studentId);
        record.setStatus(status);
        record.setCheckedInAt(now);
        record.setSource("qr_scan");
        record.setLocation(toJson(req.getLocation()));
        record.setCreatedAt(now);

        checkinRecordMapper.insert(record);

        StudentEventType eventType = "late".equals(status)
                ? StudentEventType.CHECKIN_LATE
                : StudentEventType.CHECKIN_SUCCESS;
        long lateMinutes = "late".equals(status)
                ? java.time.Duration.between(
                        activity.getStartTime().plusMinutes(activity.getLateThresholdMinutes()),
                        now).toMinutes()
                : 0L;
        studentEventPublisher.publish(studentId, eventType, "checkin", Map.of(
                "activity_id", activity.getId(),
                "activity_name", activity.getTitle() == null ? "" : activity.getTitle(),
                "late_minutes", lateMinutes
        ));
        return record;
    }

    @Transactional
    public void checkout(Long activityId, Long studentId) {
        CheckinRecord record = checkinRecordMapper.selectOne(
                new LambdaQueryWrapper<CheckinRecord>()
                        .eq(CheckinRecord::getActivityId, activityId)
                        .eq(CheckinRecord::getStudentId, studentId)
        );
        if (record == null) {
            throw CheckinErrorCode.ACTIVITY_NOT_FOUND.exception();
        }
        record.setCheckedOutAt(OffsetDateTime.now());
        checkinRecordMapper.updateById(record);
    }

    @Transactional
    public void closeActivity(Long activityId, Long userId) {
        CheckinActivity activity = getActivity(activityId);
        if (!userId.equals(activity.getCreatorId())) {
            throw CheckinErrorCode.ACTIVITY_NOT_FOUND.exception();
        }
        activity.setStatus("closed");
        checkinActivityMapper.updateById(activity);
    }

    public List<CheckinRecord> getRecords(Long activityId) {
        return checkinRecordMapper.selectList(
                new LambdaQueryWrapper<CheckinRecord>()
                        .eq(CheckinRecord::getActivityId, activityId)
        );
    }

    @Transactional
    public void rollCall(Long activityId, RollCallRequest req, Long operatorId) {
        getActivity(activityId);
        OffsetDateTime now = OffsetDateTime.now();

        for (RollCallRequest.RollCallEntry entry : req.getRecords()) {
            CheckinRecord existing = checkinRecordMapper.selectOne(
                    new LambdaQueryWrapper<CheckinRecord>()
                            .eq(CheckinRecord::getActivityId, activityId)
                            .eq(CheckinRecord::getStudentId, entry.getStudentId())
            );
            if (existing != null) {
                existing.setStatus(entry.getStatus());
                existing.setSource("roll_call");
                existing.setOperatorId(operatorId);
                checkinRecordMapper.updateById(existing);
            } else {
                CheckinRecord record = new CheckinRecord();
                record.setTenantId(TenantContext.getTenantId());
                record.setActivityId(activityId);
                record.setStudentId(entry.getStudentId());
                record.setStatus(entry.getStatus());
                record.setSource("roll_call");
                record.setOperatorId(operatorId);
                if (!"absent".equals(entry.getStatus())) {
                    record.setCheckedInAt(now);
                }
                record.setCreatedAt(now);
                checkinRecordMapper.insert(record);
            }
        }
    }

    @Transactional
    public CheckinRecord supplement(Long activityId, SupplementRequest req, Long operatorId) {
        getActivity(activityId);

        long existingCount = checkinRecordMapper.selectCount(
                new LambdaQueryWrapper<CheckinRecord>()
                        .eq(CheckinRecord::getActivityId, activityId)
                        .eq(CheckinRecord::getStudentId, req.getStudentId())
        );
        if (existingCount > 0) {
            throw CheckinErrorCode.ALREADY_SIGNED.exception();
        }

        OffsetDateTime now = OffsetDateTime.now();
        CheckinRecord record = new CheckinRecord();
        record.setTenantId(TenantContext.getTenantId());
        record.setActivityId(activityId);
        record.setStudentId(req.getStudentId());
        record.setStatus("on_time");
        record.setCheckedInAt(now);
        record.setSource("manual");
        record.setOperatorId(operatorId);
        record.setNote(req.getNote());
        record.setCreatedAt(now);

        checkinRecordMapper.insert(record);
        return record;
    }

    // --- Private helpers ---

    private void validateQrPayload(String payload, CheckinActivity activity) {
        String[] parts = payload.split(":");
        if (parts.length != 3) {
            throw CheckinErrorCode.INVALID_QR.exception();
        }
        String activityIdStr = parts[0];
        String bucketStr = parts[1];
        String providedHmac = parts[2];

        long nowSeconds = System.currentTimeMillis() / 1000;
        long currentBucket = nowSeconds / activity.getQrRefreshInterval();

        long payloadBucket;
        try {
            payloadBucket = Long.parseLong(bucketStr);
        } catch (NumberFormatException e) {
            throw CheckinErrorCode.INVALID_QR.exception();
        }

        if (Math.abs(currentBucket - payloadBucket) > 1) {
            throw CheckinErrorCode.INVALID_QR.exception();
        }

        String dataToSign = activityIdStr + ":" + bucketStr;
        String expectedHmac = computeHmac(dataToSign, activity.getQrCodeSecret());
        if (!expectedHmac.equals(providedHmac)) {
            throw CheckinErrorCode.INVALID_QR.exception();
        }
    }

    private String computeHmac(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(rawHmac);
        } catch (Exception e) {
            log.error("Failed to compute HMAC: {}", e.getMessage());
            throw CheckinErrorCode.INVALID_QR.exception();
        }
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize value to JSON: {}", e.getMessage());
            return null;
        }
    }
}
