package com.xg.business.leave.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.leave.mapper.LeaveRequestMapper;
import com.xg.business.leave.model.LeaveRequest;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.notification.service.SendNotificationRequest;
import com.xg.platform.weather.client.WeatherClient;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LeaveReminderServiceTest {

    @Mock LeaveRequestMapper leaveMapper;
    @Mock NotificationService notificationService;
    @Mock AssigneeLookupMapper assigneeLookup;
    @Mock WeatherClient weatherClient;
    @Mock ObjectMapper objectMapper;

    @InjectMocks LeaveReminderService service;

    private LeaveRequest leave(Long id, Long studentId, String studentName,
                               OffsetDateTime start, OffsetDateTime end,
                               String typeCode, String typeName,
                               BigDecimal days, String formData) {
        LeaveRequest l = new LeaveRequest();
        l.setId(id);
        l.setStudentId(studentId);
        l.setStudentName(studentName);
        l.setStartTime(start);
        l.setEndTime(end);
        l.setLeaveTypeCode(typeCode);
        l.setLeaveTypeName(typeName);
        l.setDurationDays(days);
        l.setStatus("approved");
        if (formData != null) l.setFormData(formData);
        return l;
    }

    private LeaveRequest simpleLeave(Long id) {
        OffsetDateTime now = OffsetDateTime.now();
        return leave(id, 100L, "张三", now.plusHours(1), now.plusHours(25),
                "personal", "事假", new BigDecimal("1"), null);
    }

    // -------- empty paths --------

    @Test
    void scan_noLeaves_zeroFired() {
        when(leaveMapper.selectList(any())).thenReturn(Collections.emptyList());
        int fired = service.scanCurrentTenant();
        assertThat(fired).isZero();
        verifyNoInteractions(notificationService);
        // 4 selectList calls — one per branch — even when each returns empty.
        verify(leaveMapper, times(4)).selectList(any());
    }

    // -------- start branch --------

    @Test
    void startBranch_fires_marksBit_andSendsToStudent() {
        LeaveRequest l = simpleLeave(1L);
        // Only the first selectList (start branch) returns a row; the next 3 are empty.
        when(leaveMapper.selectList(any()))
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService, times(1)).send(req.capture());
        SendNotificationRequest r = req.getValue();
        assertThat(r.getTitle()).isEqualTo("假期即将开始");
        assertThat(r.getRecipientUserIds()).containsExactly(100L);
        assertThat(r.getChannels()).containsExactly("in_app");
        assertThat(r.getSourceType()).isEqualTo("leave");
        assertThat(r.getSourceId()).isEqualTo(1L);
        assertThat(r.getContent()).contains("事假").contains("请妥善安排好行程");

        // Bit 1 OR'd into mask. setSql is recorded inside the wrapper, so we
        // can't easily inspect it via Mockito; just verify update was invoked
        // with a wrapper (signaling markBit ran).
        verify(leaveMapper, times(1)).update(isNull(), any(LambdaUpdateWrapper.class));
    }

    @Test
    void startBranch_skipsWeather_whenDestinationMissing() {
        LeaveRequest l = simpleLeave(2L);
        when(leaveMapper.selectList(any()))
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());

        service.scanCurrentTenant();

        // No formData → no objectMapper.readValue call → no weather call.
        verifyNoInteractions(weatherClient);
        verifyNoInteractions(objectMapper);

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService).send(req.capture());
        assertThat(req.getValue().getContent()).doesNotContain("目的地");
    }

    @Test
    void startBranch_skipsWeather_whenClientReturnsNull() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        LeaveRequest l = leave(3L, 100L, "李四",
                now.plusHours(1), now.plusHours(25),
                "personal", "事假", new BigDecimal("1"),
                "{\"destination\":\"奶奶家\"}");
        when(leaveMapper.selectList(any()))
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());
        when(objectMapper.readValue(eq("{\"destination\":\"奶奶家\"}"), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(java.util.Map.of("destination", "奶奶家"));
        when(weatherClient.fetchSummary("奶奶家")).thenReturn(null);

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService).send(req.capture());
        assertThat(req.getValue().getContent()).doesNotContain("目的地");
    }

    @Test
    void startBranch_appendsWeather_whenClientReturnsSummary() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        LeaveRequest l = leave(4L, 100L, "王五",
                now.plusHours(1), now.plusHours(25),
                "personal", "事假", new BigDecimal("1"),
                "{\"destination\":\"杭州\"}");
        when(leaveMapper.selectList(any()))
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());
        when(objectMapper.readValue(eq("{\"destination\":\"杭州\"}"), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(java.util.Map.of("destination", "杭州"));
        when(weatherClient.fetchSummary("杭州"))
                .thenReturn("目的地杭州当前晴 18°C，西北风3级，注意天气变化。");

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService).send(req.capture());
        assertThat(req.getValue().getContent())
                .contains("请妥善安排好行程")
                .contains("目的地杭州")
                .contains("18°C");
    }

    // -------- pre_end / due / overdue branches --------

    @Test
    void preEndBranch_fires_andSetsImportantTitle() {
        LeaveRequest l = simpleLeave(5L);
        when(leaveMapper.selectList(any()))
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService).send(req.capture());
        assertThat(req.getValue().getTitle()).isEqualTo("假期即将结束");
        assertThat(req.getValue().getLevel()).isEqualTo("normal");
    }

    @Test
    void dueBranch_fires_withImportantLevel() {
        LeaveRequest l = simpleLeave(6L);
        when(leaveMapper.selectList(any()))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList());

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService).send(req.capture());
        assertThat(req.getValue().getTitle()).isEqualTo("请假已到期，请尽快销假");
        assertThat(req.getValue().getLevel()).isEqualTo("important");
    }

    @Test
    void overdueBranch_notifiesStudent_andCounselor() {
        OffsetDateTime now = OffsetDateTime.now();
        LeaveRequest l = leave(7L, 100L, "赵六",
                now.minusDays(2), now.minusHours(5),     // ended 5h ago
                "personal", "事假", new BigDecimal("1"), null);
        when(leaveMapper.selectList(any()))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(l));
        when(assigneeLookup.findCounselorsOfStudent(100L)).thenReturn(List.of(200L, 201L));

        service.scanCurrentTenant();

        ArgumentCaptor<SendNotificationRequest> req = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService, times(2)).send(req.capture());

        List<SendNotificationRequest> sent = req.getAllValues();
        // First send → student, urgent
        assertThat(sent.get(0).getRecipientUserIds()).containsExactly(100L);
        assertThat(sent.get(0).getLevel()).isEqualTo("urgent");
        assertThat(sent.get(0).getTitle()).contains("超时");
        // Second send → both counselors, important
        assertThat(sent.get(1).getRecipientUserIds()).containsExactlyInAnyOrder(200L, 201L);
        assertThat(sent.get(1).getLevel()).isEqualTo("important");
        assertThat(sent.get(1).getContent()).contains("赵六");
    }

    @Test
    void overdueBranch_noCounselor_stillNotifiesStudent() {
        OffsetDateTime now = OffsetDateTime.now();
        LeaveRequest l = leave(8L, 100L, "孤儿",
                now.minusDays(2), now.minusHours(3),
                "personal", "事假", new BigDecimal("1"), null);
        when(leaveMapper.selectList(any()))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(List.of(l));
        when(assigneeLookup.findCounselorsOfStudent(100L)).thenReturn(Collections.emptyList());

        service.scanCurrentTenant();

        // Only the student notification, no counselor escalation.
        verify(notificationService, times(1)).send(any());
    }

    // -------- failure semantics --------

    @Test
    void sendFailure_doesNotMarkBit() {
        LeaveRequest l = simpleLeave(9L);
        when(leaveMapper.selectList(any()))
                .thenReturn(List.of(l))
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList())
                .thenReturn(Collections.emptyList());
        doThrow(new RuntimeException("upstream down"))
                .when(notificationService).send(any());

        // Should not bubble.
        service.scanCurrentTenant();

        // markBit calls update(); on send failure update must NOT be called.
        verify(leaveMapper, never()).update(any(), any(Wrapper.class));
    }
}
