package com.xg.business.workstudy.security;

import cn.dev33.satoken.stp.StpUtil;
import com.xg.business.workstudy.service.EmployerService;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * §7.4/§7.5 验收的单元锁:管理员看全部、本单位 leader/operator 看本单位、外单位 false。
 * StpUtil 是静态门面,用 mockStatic 控制权限码,不起 sa-token 上下文。
 */
class WorkStudyAccessScopeServiceTest {

    private final EmployerService employerService = mock(EmployerService.class);
    private final WorkStudyAccessScopeService svc = new WorkStudyAccessScopeService(employerService);

    @Test
    void schoolAdmin_seesAnyEmployer_withoutOwnershipCheck() {
        try (MockedStatic<StpUtil> st = mockStatic(StpUtil.class)) {
            st.when(() -> StpUtil.hasPermission("workstudy:employer:manage")).thenReturn(true);

            assertThat(svc.canViewEmployerStaff(999L, 42L)).isTrue();
            // 管理员路径不应再去查归属
            verify(employerService, never()).isUserOperatorOrLeader(anyLong(), anyLong());
        }
    }

    @Test
    void nonAdmin_leaderOrOperator_seesOwnEmployer() {
        try (MockedStatic<StpUtil> st = mockStatic(StpUtil.class)) {
            st.when(() -> StpUtil.hasPermission("workstudy:employer:manage")).thenReturn(false);
            when(employerService.isUserOperatorOrLeader(42L, 7L)).thenReturn(true);

            assertThat(svc.canViewEmployerStaff(7L, 42L)).isTrue();
        }
    }

    @Test
    void nonAdmin_outsider_isDenied() {
        try (MockedStatic<StpUtil> st = mockStatic(StpUtil.class)) {
            st.when(() -> StpUtil.hasPermission("workstudy:employer:manage")).thenReturn(false);
            when(employerService.isUserOperatorOrLeader(42L, 7L)).thenReturn(false);

            assertThat(svc.canViewEmployerStaff(7L, 42L)).isFalse();
        }
    }
}
