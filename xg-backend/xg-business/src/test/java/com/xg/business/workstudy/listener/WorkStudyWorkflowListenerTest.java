package com.xg.business.workstudy.listener;

import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.platform.notification.service.NotificationService;
import com.xg.platform.workflow.event.WorkflowFinishedEvent;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkStudyWorkflowListenerTest {

    @Mock WorkStudyPositionMapper positionMapper;
    @Mock WorkStudyApplicationMapper applicationMapper;
    @Mock WorkStudySalaryMapper salaryMapper;
    @Mock TaskInstanceMapper taskMapper;
    @Mock NotificationService notificationService;

    @InjectMocks WorkStudyWorkflowListener listener;

    private WorkflowFinishedEvent event(String bizType, Long bizId, String finalStatus) {
        WorkflowInstance i = new WorkflowInstance();
        i.setId(999L);
        i.setBizType(bizType);
        i.setBizId(bizId);
        i.setStatus(finalStatus);
        return new WorkflowFinishedEvent(i, "end_node");
    }

    private WorkStudyPosition newPosition(String status, Integer headcount, Integer hired) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        p.setStatus(status);
        p.setHeadcount(headcount);
        p.setHiredCount(hired);
        return p;
    }

    private WorkStudyApplication newApp(String status) {
        WorkStudyApplication a = new WorkStudyApplication();
        a.setId(20L);
        a.setStatus(status);
        a.setPositionId(10L);
        return a;
    }

    private WorkStudySalary newSalary(String status) {
        WorkStudySalary s = new WorkStudySalary();
        s.setId(30L);
        s.setStatus(status);
        return s;
    }

    // ----- noise / guards -----

    @Test
    void noBizId_noOp() {
        listener.onWorkflowFinished(event("workstudy_position", null, "completed"));
        verifyNoInteractions(positionMapper, applicationMapper, salaryMapper);
    }

    @Test
    void unknownBizType_noOp() {
        listener.onWorkflowFinished(event("leave", 1L, "completed"));
        verifyNoInteractions(positionMapper, applicationMapper, salaryMapper);
    }

    // ----- position -----

    @Test
    void position_pendingApproval_completed_flipsToOpen() {
        when(positionMapper.selectById(10L)).thenReturn(newPosition("pending_approval", 3, 0));
        listener.onWorkflowFinished(event("workstudy_position", 10L, "completed"));
        ArgumentCaptor<WorkStudyPosition> cap = ArgumentCaptor.forClass(WorkStudyPosition.class);
        verify(positionMapper).updateById(cap.capture());
        assertThat(cap.getValue().getStatus()).isEqualTo("open");
    }

    @Test
    void position_pendingApproval_rejected_flipsToClosed() {
        when(positionMapper.selectById(10L)).thenReturn(newPosition("pending_approval", 3, 0));
        listener.onWorkflowFinished(event("workstudy_position", 10L, "rejected"));
        ArgumentCaptor<WorkStudyPosition> cap = ArgumentCaptor.forClass(WorkStudyPosition.class);
        verify(positionMapper).updateById(cap.capture());
        assertThat(cap.getValue().getStatus()).isEqualTo("closed");
    }

    @Test
    void position_alreadyOpen_isNotOverwritten() {
        when(positionMapper.selectById(10L)).thenReturn(newPosition("open", 3, 0));
        listener.onWorkflowFinished(event("workstudy_position", 10L, "rejected"));
        verify(positionMapper, never()).updateById(any(WorkStudyPosition.class));
    }

    // ----- application -----

    @Test
    void application_pending_completed_hires_and_bumpsHeadcount() {
        when(applicationMapper.selectById(20L)).thenReturn(newApp("pending"));
        when(positionMapper.selectById(10L)).thenReturn(newPosition("open", 3, 1));
        listener.onWorkflowFinished(event("workstudy_application", 20L, "completed"));

        ArgumentCaptor<WorkStudyApplication> appCap = ArgumentCaptor.forClass(WorkStudyApplication.class);
        verify(applicationMapper).updateById(appCap.capture());
        assertThat(appCap.getValue().getStatus()).isEqualTo("hired");

        ArgumentCaptor<WorkStudyPosition> posCap = ArgumentCaptor.forClass(WorkStudyPosition.class);
        verify(positionMapper).updateById(posCap.capture());
        assertThat(posCap.getValue().getHiredCount()).isEqualTo(2);
        assertThat(posCap.getValue().getStatus()).isEqualTo("open");   // not yet at headcount
    }

    @Test
    void application_completion_atHeadcount_autoClosesPosition() {
        when(applicationMapper.selectById(20L)).thenReturn(newApp("pending"));
        when(positionMapper.selectById(10L)).thenReturn(newPosition("open", 2, 1));
        listener.onWorkflowFinished(event("workstudy_application", 20L, "completed"));

        ArgumentCaptor<WorkStudyPosition> posCap = ArgumentCaptor.forClass(WorkStudyPosition.class);
        verify(positionMapper).updateById(posCap.capture());
        assertThat(posCap.getValue().getHiredCount()).isEqualTo(2);
        assertThat(posCap.getValue().getStatus()).isEqualTo("closed");
    }

    @Test
    void application_pending_rejected_setsRejected_doesNotBumpHeadcount() {
        when(applicationMapper.selectById(20L)).thenReturn(newApp("pending"));
        listener.onWorkflowFinished(event("workstudy_application", 20L, "rejected"));

        ArgumentCaptor<WorkStudyApplication> appCap = ArgumentCaptor.forClass(WorkStudyApplication.class);
        verify(applicationMapper).updateById(appCap.capture());
        assertThat(appCap.getValue().getStatus()).isEqualTo("rejected");
        verify(positionMapper, never()).updateById(any(WorkStudyPosition.class));
    }

    @Test
    void application_alreadyHired_isNotReprocessed() {
        when(applicationMapper.selectById(20L)).thenReturn(newApp("hired"));
        listener.onWorkflowFinished(event("workstudy_application", 20L, "completed"));
        verify(applicationMapper, never()).updateById(any(WorkStudyApplication.class));
        verify(positionMapper, never()).updateById(any(WorkStudyPosition.class));
    }

    // ----- salary -----

    @Test
    void salary_pending_completed_flipsToConfirmedWithTimestamp() {
        when(salaryMapper.selectById(30L)).thenReturn(newSalary("pending"));
        listener.onWorkflowFinished(event("workstudy_salary", 30L, "completed"));
        ArgumentCaptor<WorkStudySalary> cap = ArgumentCaptor.forClass(WorkStudySalary.class);
        verify(salaryMapper).updateById(cap.capture());
        assertThat(cap.getValue().getStatus()).isEqualTo("confirmed");
        assertThat(cap.getValue().getConfirmedAt()).isNotNull();
    }

    @Test
    void salary_pending_rejected_flipsToRejected() {
        when(salaryMapper.selectById(30L)).thenReturn(newSalary("pending"));
        listener.onWorkflowFinished(event("workstudy_salary", 30L, "rejected"));
        ArgumentCaptor<WorkStudySalary> cap = ArgumentCaptor.forClass(WorkStudySalary.class);
        verify(salaryMapper).updateById(cap.capture());
        assertThat(cap.getValue().getStatus()).isEqualTo("rejected");
    }

    @Test
    void salary_paid_isNotOverwritten() {
        when(salaryMapper.selectById(30L)).thenReturn(newSalary("paid"));
        listener.onWorkflowFinished(event("workstudy_salary", 30L, "completed"));
        verify(salaryMapper, never()).updateById(any(WorkStudySalary.class));
    }
}
