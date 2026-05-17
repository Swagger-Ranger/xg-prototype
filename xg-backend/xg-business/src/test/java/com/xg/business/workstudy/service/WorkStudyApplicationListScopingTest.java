package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.common.base.PageResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * employer 角色在 listApplications 路径上的越权防护。
 * 真实漏洞:AI 工具 summarize_workstudy_applicants 允许 employer 调用,
 * 工具最终打到 /api/v1/work-study/applications?positionId=X — 后端原本
 * 只对 student 做归属过滤,employer 可以传任意 positionId 拿到其他单位
 * 候选人的姓名/困难等级/申请理由 PII。
 */
@ExtendWith(MockitoExtension.class)
class WorkStudyApplicationListScopingTest {

    @Mock WorkStudyApplicationMapper applicationMapper;
    @Mock WorkStudyPositionMapper positionMapper;
    @Mock EmployerService employerService;

    @InjectMocks WorkStudyService service;

    private ApplicationQueryRequest baseQuery() {
        ApplicationQueryRequest q = new ApplicationQueryRequest();
        q.setPage(1);
        q.setSize(20);
        return q;
    }

    private Employer employer(long id) {
        Employer e = new Employer();
        e.setId(id);
        return e;
    }

    private WorkStudyPosition position(long id) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(id);
        return p;
    }

    @Test
    void employerWithNoAffiliation_returnsEmptyPage_andDoesNotHitApplicationMapper() {
        when(employerService.listMine(42L)).thenReturn(List.of());

        PageResult<WorkStudyApplication> result =
                service.listApplicationsScopedToEmployers(baseQuery(), 42L);

        assertThat(result.getData()).isEmpty();
        assertThat(result.getTotal()).isZero();
        // 没单位归属 → 短路返回,绝不能下推到 applicationMapper
        verify(applicationMapper, never()).selectPage(any(), any());
    }

    @Test
    void employerWithEmployersButNoPositions_returnsEmptyPage() {
        when(employerService.listMine(42L)).thenReturn(List.of(employer(1L)));
        // employer 存在但还没发布过岗位
        when(positionMapper.selectList(any())).thenReturn(List.of());

        PageResult<WorkStudyApplication> result =
                service.listApplicationsScopedToEmployers(baseQuery(), 42L);

        assertThat(result.getData()).isEmpty();
        verify(applicationMapper, never()).selectPage(any(), any());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void employerAsksForForeignPositionId_returnsEmptyPage_andDoesNotHitApplicationMapper() {
        when(employerService.listMine(42L)).thenReturn(List.of(employer(1L)));
        // 调用者的单位有 position 100、101
        when(positionMapper.selectList(any())).thenReturn(List.of(position(100L), position(101L)));

        // 但 AI 工具传了一个不属于该单位的 positionId 999
        ApplicationQueryRequest q = baseQuery();
        q.setPositionId(999L);

        PageResult<WorkStudyApplication> result =
                service.listApplicationsScopedToEmployers(q, 42L);

        assertThat(result.getData()).isEmpty();
        assertThat(result.getTotal()).isZero();
        // 这是核心安全断言:外单位 positionId 必须被短路掉,不能漏数据
        verify(applicationMapper, never()).selectPage(any(), any());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void employerAsksForOwnPositionId_passesThroughWithRestrictionApplied() {
        when(employerService.listMine(42L)).thenReturn(List.of(employer(1L)));
        when(positionMapper.selectList(any())).thenReturn(List.of(position(100L), position(101L)));

        Page<WorkStudyApplication> mockPage = new Page<>(1, 20);
        mockPage.setRecords(List.of());
        mockPage.setTotal(0);
        when(applicationMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(mockPage);

        ApplicationQueryRequest q = baseQuery();
        q.setPositionId(100L);

        service.listApplicationsScopedToEmployers(q, 42L);

        // 验证下推 + restriction 拼上了。具体 SQL 由 MyBatis-Plus 生成,这里只验证调用形态。
        ArgumentCaptor<LambdaQueryWrapper> wrapperCap = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(applicationMapper).selectPage(any(Page.class), wrapperCap.capture());
        assertThat(wrapperCap.getValue()).isNotNull();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void employerAsksWithoutPositionId_scopesToAllOwnPositions() {
        when(employerService.listMine(42L)).thenReturn(List.of(employer(1L), employer(2L)));
        when(positionMapper.selectList(any()))
                .thenReturn(List.of(position(100L), position(101L), position(200L)));

        Page<WorkStudyApplication> mockPage = new Page<>(1, 20);
        mockPage.setRecords(List.of());
        mockPage.setTotal(0);
        when(applicationMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(mockPage);

        // 不传 positionId,但服务端要自动把限制加上
        service.listApplicationsScopedToEmployers(baseQuery(), 42L);

        verify(applicationMapper).selectPage(any(Page.class), any(LambdaQueryWrapper.class));
    }
}
