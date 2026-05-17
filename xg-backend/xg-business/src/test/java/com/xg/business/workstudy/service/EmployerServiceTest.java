package com.xg.business.workstudy.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerStaffItem;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
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
    @Mock SysUserMapper sysUserMapper;

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
    void listStaff_returnsLeaderFirstThenOperators_andSkipsInactiveAndMissing() {
        // 单位 7：leader=100，operators=[101, 102, 999]；其中 102 status=disabled，999 在 sys_user 缺失。
        Employer e = new Employer();
        e.setId(7L);
        e.setLeaderUserId(100L);
        e.setOperatorUserIds("[101,102,999]");
        e.setStatus("active");
        when(employerMapper.selectById(7L)).thenReturn(e);

        SysUser u100 = new SysUser(); u100.setId(100L); u100.setRealName("张三"); u100.setStatus("active");
        SysUser u101 = new SysUser(); u101.setId(101L); u101.setUsername("li_si"); u101.setStatus("active"); // 无 realName，落 username
        SysUser u102 = new SysUser(); u102.setId(102L); u102.setRealName("王五"); u102.setStatus("disabled");
        when(sysUserMapper.selectBatchIds(anyCollection())).thenReturn(List.of(u100, u101, u102));

        List<EmployerStaffItem> staff = service.listStaff(7L);

        // 期望：leader 张三 在前，操作员 li_si 紧随；disabled 的王五和缺失的 999 都被过滤
        assertThat(staff).hasSize(2);
        assertThat(staff.get(0).getName()).isEqualTo("张三");
        assertThat(staff.get(0).getRole()).isEqualTo("leader");
        assertThat(staff.get(1).getName()).isEqualTo("li_si");
        assertThat(staff.get(1).getRole()).isEqualTo("operator");
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
