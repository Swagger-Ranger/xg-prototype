package com.xg.business.workstudy.workflow;

import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.platform.workflow.model.WorkflowInstance;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkStudyAssigneeStrategyTest {

    @Mock WorkStudyPositionMapper positionMapper;
    @Mock WorkStudyApplicationMapper applicationMapper;
    @Mock EmployerMapper employerMapper;

    @InjectMocks WorkStudyAssigneeStrategy strategy;

    private WorkflowInstance instance(Long bizId) {
        WorkflowInstance i = new WorkflowInstance();
        i.setId(99L);
        i.setBizId(bizId);
        return i;
    }

    // ----- supports() -----

    @Test
    void supports_employerLeader_andPositionOwner_only() {
        assertThat(strategy.supports("employer_leader", "same_employer")).isTrue();
        assertThat(strategy.supports("position_owner", "same_position")).isTrue();
        assertThat(strategy.supports("counselor", "same_class")).isFalse();
        assertThat(strategy.supports("employer_leader", "global")).isFalse();
    }

    // ----- employer_leader -----

    @Test
    void employerLeader_resolvesViaEmployerLookup() {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        p.setEmployerId(7L);
        when(positionMapper.selectById(10L)).thenReturn(p);

        Employer e = new Employer();
        e.setId(7L);
        e.setLeaderUserId(555L);
        when(employerMapper.selectById(7L)).thenReturn(e);

        assertThat(strategy.resolve("employer_leader", "same_employer", instance(10L)))
                .containsExactly(555L);
    }

    @Test
    void employerLeader_returnsEmptyWhenPositionMissing() {
        when(positionMapper.selectById(10L)).thenReturn(null);
        assertThat(strategy.resolve("employer_leader", "same_employer", instance(10L))).isEmpty();
    }

    @Test
    void employerLeader_returnsEmptyWhenEmployerIdMissing() {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        // no employerId
        when(positionMapper.selectById(10L)).thenReturn(p);
        assertThat(strategy.resolve("employer_leader", "same_employer", instance(10L))).isEmpty();
    }

    @Test
    void employerLeader_returnsEmptyWhenEmployerHasNoLeader() {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        p.setEmployerId(7L);
        when(positionMapper.selectById(10L)).thenReturn(p);

        Employer e = new Employer();
        e.setId(7L);
        // no leader_user_id
        when(employerMapper.selectById(7L)).thenReturn(e);

        assertThat(strategy.resolve("employer_leader", "same_employer", instance(10L))).isEmpty();
    }

    // ----- position_owner -----

    @Test
    void positionOwner_resolvesViaApplicationThenPosition() {
        WorkStudyApplication app = new WorkStudyApplication();
        app.setId(20L);
        app.setPositionId(10L);
        when(applicationMapper.selectById(20L)).thenReturn(app);

        WorkStudyPosition pos = new WorkStudyPosition();
        pos.setId(10L);
        pos.setOwnerUserId(888L);
        when(positionMapper.selectById(10L)).thenReturn(pos);

        assertThat(strategy.resolve("position_owner", "same_position", instance(20L)))
                .containsExactly(888L);
    }

    @Test
    void positionOwner_returnsEmptyWhenApplicationMissing() {
        when(applicationMapper.selectById(20L)).thenReturn(null);
        assertThat(strategy.resolve("position_owner", "same_position", instance(20L))).isEmpty();
    }

    @Test
    void positionOwner_returnsEmptyWhenPositionHasNoOwner() {
        WorkStudyApplication app = new WorkStudyApplication();
        app.setId(20L);
        app.setPositionId(10L);
        when(applicationMapper.selectById(20L)).thenReturn(app);

        WorkStudyPosition pos = new WorkStudyPosition();
        pos.setId(10L);
        // no owner_user_id
        when(positionMapper.selectById(10L)).thenReturn(pos);

        assertThat(strategy.resolve("position_owner", "same_position", instance(20L))).isEmpty();
    }

    // ----- guards -----

    @Test
    void resolve_returnsEmptyWhenBizIdNull() {
        assertThat(strategy.resolve("employer_leader", "same_employer", instance(null))).isEmpty();
    }
}
