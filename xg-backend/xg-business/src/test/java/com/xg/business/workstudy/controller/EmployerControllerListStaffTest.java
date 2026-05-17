package com.xg.business.workstudy.controller;

import com.xg.business.workstudy.dto.EmployerStaffItem;
import com.xg.business.workstudy.security.WorkStudyAccessScopeService;
import com.xg.business.workstudy.service.EmployerService;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.workflow.mapper.AssigneeLookupMapper;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * S3-4 安全边界回归(§7.4/§7.5):listStaff 的 403 闸是真实泄漏关闭点,
 * 单测 service 不覆盖 controller 是否真的先判后查。锁:无权时抛 FORBIDDEN
 * 且绝不调 employerService.listStaff;有权时正常放行。
 */
class EmployerControllerListStaffTest {

    private final EmployerService employerService = mock(EmployerService.class);
    private final AssigneeLookupMapper roleLookup = mock(AssigneeLookupMapper.class);
    private final WorkStudyAccessScopeService accessScope = mock(WorkStudyAccessScopeService.class);
    private final EmployerController controller =
            new EmployerController(employerService, roleLookup, accessScope);

    @Test
    void unauthorizedViewer_isForbidden_andStaffNeverQueried() {
        try (MockedStatic<CurrentUser> cu = mockStatic(CurrentUser.class)) {
            cu.when(CurrentUser::id).thenReturn(7L);
            when(accessScope.canViewEmployerStaff(7L, 42L)).thenReturn(false);

            assertThatThrownBy(() -> controller.listStaff(42L))
                    .isInstanceOf(BizException.class)
                    .hasMessageContaining("无权查看");

            verify(employerService, never()).listStaff(anyLong());
        }
    }

    @Test
    void authorizedViewer_getsStaffList() {
        try (MockedStatic<CurrentUser> cu = mockStatic(CurrentUser.class)) {
            cu.when(CurrentUser::id).thenReturn(7L);
            when(accessScope.canViewEmployerStaff(7L, 42L)).thenReturn(true);
            List<EmployerStaffItem> staff = List.of(new EmployerStaffItem(1L, "张三", "leader"));
            when(employerService.listStaff(42L)).thenReturn(staff);

            R<List<EmployerStaffItem>> resp = controller.listStaff(42L);

            assertThat(resp.getData()).isEqualTo(staff);
        }
    }
}
