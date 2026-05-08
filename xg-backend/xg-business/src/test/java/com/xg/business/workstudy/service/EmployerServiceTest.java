package com.xg.business.workstudy.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.common.exception.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmployerServiceTest {

    @Mock EmployerMapper employerMapper;

    /** Real ObjectMapper — serialization is part of the contract under test. */
    @Spy ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks EmployerService service;

    private EmployerCreateRequest baseCreate() {
        EmployerCreateRequest r = new EmployerCreateRequest();
        r.setName("图书馆");
        r.setLeaderUserId(100L);
        r.setOperatorUserIds(List.of(101L, 102L));
        r.setContactName("张三");
        r.setContactPhone("13900001111");
        r.setEmail("lib@example.com");
        r.setAllowSelfArrange(true);
        r.setRemark("校本部分馆");
        return r;
    }

    @Test
    void create_setsActiveStatus_andSerializesOperators() {
        service.create(baseCreate());

        ArgumentCaptor<Employer> cap = ArgumentCaptor.forClass(Employer.class);
        verify(employerMapper).insert(cap.capture());
        Employer e = cap.getValue();
        assertThat(e.getName()).isEqualTo("图书馆");
        assertThat(e.getStatus()).isEqualTo("active");
        assertThat(e.getAllowSelfArrange()).isTrue();
        assertThat(e.getOperatorUserIds()).isEqualTo("[101,102]");
    }

    @Test
    void create_defaultsAllowSelfArrangeToFalse_whenNull() {
        EmployerCreateRequest req = baseCreate();
        req.setAllowSelfArrange(null);
        service.create(req);

        ArgumentCaptor<Employer> cap = ArgumentCaptor.forClass(Employer.class);
        verify(employerMapper).insert(cap.capture());
        assertThat(cap.getValue().getAllowSelfArrange()).isFalse();
    }

    @Test
    void update_appliesOnlyNonNullFields() {
        Employer existing = new Employer();
        existing.setId(5L);
        existing.setName("旧名");
        existing.setLeaderUserId(1L);
        existing.setStatus("active");
        existing.setAllowSelfArrange(false);
        when(employerMapper.selectById(5L)).thenReturn(existing);

        EmployerUpdateRequest req = new EmployerUpdateRequest();
        req.setName("新名");                                       // changes
        req.setContactPhone("13800000000");                       // changes
        // leader_user_id stays null → must NOT be reset

        service.update(5L, req);

        ArgumentCaptor<Employer> cap = ArgumentCaptor.forClass(Employer.class);
        verify(employerMapper).updateById(cap.capture());
        Employer u = cap.getValue();
        assertThat(u.getName()).isEqualTo("新名");
        assertThat(u.getContactPhone()).isEqualTo("13800000000");
        assertThat(u.getLeaderUserId()).isEqualTo(1L);            // preserved
        assertThat(u.getAllowSelfArrange()).isFalse();             // preserved
    }

    @Test
    void detail_throwsWhenNotFound() {
        when(employerMapper.selectById(999L)).thenReturn(null);
        assertThatThrownBy(() -> service.detail(999L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("用人单位不存在");
    }

    @Test
    void setStatus_rejectsUnknownStatus() {
        assertThatThrownBy(() -> service.setStatus(1L, "frozen"))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("active / disabled");
        verify(employerMapper, never()).updateById(any(Employer.class));
    }

    @Test
    void setStatus_persistsValidStatus() {
        Employer e = new Employer();
        e.setId(1L);
        e.setStatus("active");
        when(employerMapper.selectById(1L)).thenReturn(e);

        service.setStatus(1L, "disabled");

        ArgumentCaptor<Employer> cap = ArgumentCaptor.forClass(Employer.class);
        verify(employerMapper).updateById(cap.capture());
        assertThat(cap.getValue().getStatus()).isEqualTo("disabled");
    }
}
