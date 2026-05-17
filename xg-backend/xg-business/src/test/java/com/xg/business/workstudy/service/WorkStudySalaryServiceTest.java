package com.xg.business.workstudy.service;

import com.xg.business.workstudy.dto.SalarySubmitRequest;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.common.exception.BizException;
import com.xg.platform.workflow.engine.WorkflowEngine;
import com.xg.platform.workflow.mapper.TaskInstanceMapper;
import com.xg.platform.workflow.model.WorkflowInstance;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkStudySalaryServiceTest {

    @Mock WorkStudySalaryMapper salaryMapper;
    @Mock WorkStudyApplicationMapper applicationMapper;
    @Mock WorkStudyPositionMapper positionMapper;
    @Mock WorkflowEngine workflowEngine;
    @Mock TaskInstanceMapper taskInstanceMapper;

    @InjectMocks WorkStudySalaryService service;

    private WorkStudyApplication hiredApp() {
        WorkStudyApplication a = new WorkStudyApplication();
        a.setId(20L);
        a.setStudentId(100L);
        a.setPositionId(10L);
        a.setStatus("hired");
        return a;
    }

    private WorkStudyPosition position(String unit, String amount, String type) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        p.setSalaryUnit(unit);
        if (amount != null) p.setSalaryAmount(new BigDecimal(amount));
        p.setPositionType(type);
        return p;
    }

    private SalarySubmitRequest req(String units, String month) {
        SalarySubmitRequest r = new SalarySubmitRequest();
        r.setApplicationId(20L);
        r.setMonth(month);
        r.setUnits(new BigDecimal(units));
        r.setReportNote("test");
        return r;
    }

    private WorkflowInstance fakeInstance(long id) {
        WorkflowInstance i = new WorkflowInstance();
        i.setId(id);
        return i;
    }

    @Test
    void submit_hourlyUnit_calculatesAmount_andSnapshotsLegacyHoursFields() {
        when(applicationMapper.selectById(20L)).thenReturn(hiredApp());
        when(positionMapper.selectById(10L)).thenReturn(position("hour", "18.50", "fixed"));
        when(workflowEngine.startWorkflowByBizType(eq("workstudy_salary"), any(), any(), any(), any()))
                .thenReturn(fakeInstance(7777L));

        WorkStudySalary out = service.submit(req("12.5", "2026-04"), 999L);

        ArgumentCaptor<WorkStudySalary> cap = ArgumentCaptor.forClass(WorkStudySalary.class);
        verify(salaryMapper).insert(cap.capture());
        WorkStudySalary inserted = cap.getValue();

        assertThat(inserted.getAmount()).isEqualByComparingTo("231.25");   // 18.50 * 12.5
        assertThat(inserted.getUnits()).isEqualByComparingTo("12.5");
        assertThat(inserted.getUnitType()).isEqualTo("hour");
        assertThat(inserted.getUnitRate()).isEqualByComparingTo("18.50");
        assertThat(inserted.getPositionType()).isEqualTo("fixed");
        assertThat(inserted.getReporterId()).isEqualTo(999L);
        // legacy snapshot for hour-unit only
        assertThat(inserted.getHours()).isEqualByComparingTo("12.5");
        assertThat(inserted.getHourlyRate()).isEqualByComparingTo("18.50");

        // status flips to pending after workflow start succeeds
        assertThat(out.getStatus()).isEqualTo("pending");
        assertThat(out.getWorkflowInstanceId()).isEqualTo(7777L);
    }

    @Test
    void submit_dayUnit_calculatesAmount_andDoesNotPopulateLegacyHours() {
        when(applicationMapper.selectById(20L)).thenReturn(hiredApp());
        when(positionMapper.selectById(10L)).thenReturn(position("day", "120.00", "temporary"));
        when(workflowEngine.startWorkflowByBizType(eq("workstudy_salary"), any(), any(), any(), any()))
                .thenReturn(fakeInstance(8888L));

        service.submit(req("3", "2026-04"), 999L);

        ArgumentCaptor<WorkStudySalary> cap = ArgumentCaptor.forClass(WorkStudySalary.class);
        verify(salaryMapper).insert(cap.capture());
        WorkStudySalary inserted = cap.getValue();
        assertThat(inserted.getAmount()).isEqualByComparingTo("360.00");
        assertThat(inserted.getUnitType()).isEqualTo("day");
        assertThat(inserted.getPositionType()).isEqualTo("temporary");
        assertThat(inserted.getHours()).isNull();        // legacy fields not snapped for non-hour units
        assertThat(inserted.getHourlyRate()).isNull();
    }
    // 删除 submit_legacyHourlyRate_isUsedWhenSalaryAmountAbsent:它验证的
    // "position.hourly_rate 兜底" 已被 fbdd6e5 显式删除;无 rate 的新行为由
    // submit_throws_whenNoRateAtAll 覆盖。

    @Test
    void submit_throws_whenApplicationNotHired() {
        WorkStudyApplication a = hiredApp();
        a.setStatus("pending");
        when(applicationMapper.selectById(20L)).thenReturn(a);

        assertThatThrownBy(() -> service.submit(req("10", "2026-04"), 999L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("未在该岗位录用");
    }

    @Test
    void submit_throws_whenNoRateAtAll() {
        when(applicationMapper.selectById(20L)).thenReturn(hiredApp());
        when(positionMapper.selectById(10L)).thenReturn(position(null, null, "fixed"));

        assertThatThrownBy(() -> service.submit(req("10", "2026-04"), 999L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("无法申报");
    }

    @Test
    void submit_keepsDraftStatus_ifWorkflowStartThrows() {
        when(applicationMapper.selectById(20L)).thenReturn(hiredApp());
        when(positionMapper.selectById(10L)).thenReturn(position("hour", "10.00", "fixed"));
        when(workflowEngine.startWorkflowByBizType(eq("workstudy_salary"), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("boom"));

        WorkStudySalary out = service.submit(req("5", "2026-04"), 999L);
        assertThat(out.getStatus()).isEqualTo("draft");
        assertThat(out.getWorkflowInstanceId()).isNull();
    }
}
