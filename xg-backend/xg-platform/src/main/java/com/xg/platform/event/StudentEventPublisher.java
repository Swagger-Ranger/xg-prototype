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
 *
 * <p>Two flavors:
 * <ul>
 *   <li>{@code publish(...)} — 不带 sourceId 的旧签名（兼容存量调用方）</li>
 *   <li>{@code publishWithSource(..., sourceId, ...)} — 携带来源业务记录 ID，
 *       care 模块规则引擎需要它来回溯到原始单据</li>
 * </ul>
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
        doPublish(studentId, type, source, null, data, OffsetDateTime.now(), type.defaultSeverity());
    }

    public void publish(Long studentId,
                        StudentEventType type,
                        String source,
                        Map<String, Object> data,
                        OffsetDateTime occurredAt) {
        doPublish(studentId, type, source, null, data, occurredAt, type.defaultSeverity());
    }

    public void publish(Long studentId,
                        StudentEventType type,
                        String source,
                        Map<String, Object> data,
                        OffsetDateTime occurredAt,
                        int severity) {
        doPublish(studentId, type, source, null, data, occurredAt, severity);
    }

    public void publishWithSource(Long studentId,
                                  StudentEventType type,
                                  String source,
                                  Long sourceId,
                                  Map<String, Object> data) {
        doPublish(studentId, type, source, sourceId, data, OffsetDateTime.now(), type.defaultSeverity());
    }

    public void publishWithSource(Long studentId,
                                  StudentEventType type,
                                  String source,
                                  Long sourceId,
                                  Map<String, Object> data,
                                  OffsetDateTime occurredAt,
                                  int severity) {
        doPublish(studentId, type, source, sourceId, data, occurredAt, severity);
    }

    private void doPublish(Long studentId,
                           StudentEventType type,
                           String source,
                           Long sourceId,
                           Map<String, Object> data,
                           OffsetDateTime occurredAt,
                           int severity) {
        if (studentId == null) {
            return;
        }
        try {
            StudentEventLog entry = new StudentEventLog();
            entry.setTenantId(TenantContext.getTenantId());
            entry.setStudentId(studentId);
            entry.setEventType(type.code());
            entry.setEventSource(source);
            entry.setSourceId(sourceId);
            entry.setEventData(data);
            entry.setSeverity(Math.max(0, Math.min(10, severity)));
            entry.setOccurredAt(occurredAt == null ? OffsetDateTime.now() : occurredAt);
            entry.setCreatedAt(OffsetDateTime.now());
            mapper.insert(entry);
        } catch (Exception e) {
            log.warn("failed to publish student event type={} studentId={} source={} sourceId={}",
                    type.code(), studentId, source, sourceId, e);
        }
    }
}
