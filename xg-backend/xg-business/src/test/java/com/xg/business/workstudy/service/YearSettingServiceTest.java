package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.dto.YearSettingUpsertRequest;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudyYearSettingMapper;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudyYearSetting;
import com.xg.common.exception.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class YearSettingServiceTest {

    @Mock WorkStudyYearSettingMapper settingMapper;
    @Mock WorkStudyPositionMapper positionMapper;

    @InjectMocks YearSettingService service;

    private YearSettingUpsertRequest req(String year, Integer fixed, Integer temp, Boolean open) {
        YearSettingUpsertRequest r = new YearSettingUpsertRequest();
        r.setAcademicYear(year);
        r.setMaxFixedPerStudent(fixed);
        r.setMaxTempPerStudent(temp);
        r.setApplicationOpen(open);
        return r;
    }

    @Test
    void upsert_insertsWhenNotExist_withDefaults() {
        when(settingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        service.upsert(req("2024-2025", null, null, null));

        ArgumentCaptor<WorkStudyYearSetting> cap = ArgumentCaptor.forClass(WorkStudyYearSetting.class);
        verify(settingMapper).insert(cap.capture());
        WorkStudyYearSetting s = cap.getValue();
        assertThat(s.getAcademicYear()).isEqualTo("2024-2025");
        assertThat(s.getMaxFixedPerStudent()).isEqualTo(1);
        assertThat(s.getMaxTempPerStudent()).isEqualTo(5);
        assertThat(s.getApplicationOpen()).isFalse();
    }

    @Test
    void upsert_updatesExisting_withOnlyProvidedFields() {
        WorkStudyYearSetting existing = new WorkStudyYearSetting();
        existing.setId(1L);
        existing.setAcademicYear("2024-2025");
        existing.setMaxFixedPerStudent(1);
        existing.setMaxTempPerStudent(5);
        existing.setApplicationOpen(false);
        when(settingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existing);

        service.upsert(req("2024-2025", 2, null, true));   // only fixed + open change

        ArgumentCaptor<WorkStudyYearSetting> cap = ArgumentCaptor.forClass(WorkStudyYearSetting.class);
        verify(settingMapper).updateById(cap.capture());
        WorkStudyYearSetting u = cap.getValue();
        assertThat(u.getMaxFixedPerStudent()).isEqualTo(2);
        assertThat(u.getMaxTempPerStudent()).isEqualTo(5);     // preserved
        assertThat(u.getApplicationOpen()).isTrue();
        verify(settingMapper, never()).insert(any(WorkStudyYearSetting.class));
    }

    @Test
    void syncPositions_rejectsSameYear() {
        assertThatThrownBy(() -> service.syncPositionsFromYear("2024-2025", "2024-2025"))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("不相等");
        verifyNoInteractions(positionMapper);
    }

    @Test
    void syncPositions_rejectsNullArguments() {
        assertThatThrownBy(() -> service.syncPositionsFromYear(null, "2023-2024"))
                .isInstanceOf(BizException.class);
        assertThatThrownBy(() -> service.syncPositionsFromYear("2024-2025", null))
                .isInstanceOf(BizException.class);
    }

    @Test
    void syncPositions_returnsZeroWhenSourceEmpty() {
        when(positionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        int copied = service.syncPositionsFromYear("2024-2025", "2023-2024");
        assertThat(copied).isZero();
        verify(positionMapper, never()).insert(any(WorkStudyPosition.class));
    }

    @Test
    void syncPositions_copiesFields_resetsHiredCount_marksDraft() {
        WorkStudyPosition src = new WorkStudyPosition();
        src.setTitle("图书馆值班");
        src.setPositionType("fixed");
        src.setEmployerId(7L);
        src.setSalaryUnit("hour");
        src.setSalaryAmount(new BigDecimal("18.50"));
        src.setHeadcount(3);
        src.setHiredCount(2);                 // should reset
        src.setStatus("closed");              // should reset to draft
        src.setAcademicYear("2023-2024");
        src.setCampus("本部");
        src.setSelfArranged(true);

        when(positionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(src));

        int copied = service.syncPositionsFromYear("2024-2025", "2023-2024");
        assertThat(copied).isOne();

        ArgumentCaptor<WorkStudyPosition> cap = ArgumentCaptor.forClass(WorkStudyPosition.class);
        verify(positionMapper).insert(cap.capture());
        WorkStudyPosition copy = cap.getValue();
        assertThat(copy.getTitle()).isEqualTo("图书馆值班");
        assertThat(copy.getEmployerId()).isEqualTo(7L);
        assertThat(copy.getAcademicYear()).isEqualTo("2024-2025");
        assertThat(copy.getStatus()).isEqualTo("draft");
        assertThat(copy.getHiredCount()).isZero();
        assertThat(copy.getCampus()).isEqualTo("本部");
        assertThat(copy.getSelfArranged()).isTrue();
        assertThat(copy.getSalaryAmount()).isEqualByComparingTo("18.50");
    }
}
