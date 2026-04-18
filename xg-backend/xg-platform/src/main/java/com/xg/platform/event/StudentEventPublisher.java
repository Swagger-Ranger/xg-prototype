package com.xg.platform.event;

import com.xg.common.tenant.TenantContext;
import com.xg.platform.event.mapper.StudentEventLogMapper;
import com.xg.platform.event.model.StudentEventLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Writes to {@code student_event_log}. Failures are swallowed with a warn log — the
 * event stream is observability, it must never block a business transaction.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StudentEventPublisher {

    private final StudentEventLogMapper mapper;

    public void publish(Long studentId,
                        StudentEventType type,
                        String source,
                        Map<String, Object> data) {
        publish(studentId, type, source, data, OffsetDateTime.now());
    }

    public void publish(Long studentId,
                        StudentEventType type,
                        String source,
                        Map<String, Object> data,
                        OffsetDateTime occurredAt) {
        if (studentId == null) {
            return;
        }
        try {
            StudentEventLog entry = new StudentEventLog();
            entry.setTenantId(TenantContext.getTenantId());
            entry.setStudentId(studentId);
            entry.setEventType(type.code());
            entry.setEventSource(source);
            entry.setEventData(data);
            entry.setOccurredAt(occurredAt == null ? OffsetDateTime.now() : occurredAt);
            entry.setCreatedAt(OffsetDateTime.now());
            mapper.insert(entry);
        } catch (Exception e) {
            log.warn("failed to publish student event type={} studentId={} source={}",
                    type.code(), studentId, source, e);
        }
    }
}
