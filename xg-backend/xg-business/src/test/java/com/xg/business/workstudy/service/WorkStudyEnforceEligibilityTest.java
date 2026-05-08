package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudyYearSettingMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudyYearSetting;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Full-path tests for {@code enforceApplyEligibility} — covers the in-job limit
 * branches that {@link WorkStudyEligibilityTest} can't reach.
 */
@ExtendWith(MockitoExtension.class)
class WorkStudyEnforceEligibilityTest {

    @Mock WorkStudyPositionMapper positionMapper;
    @Mock WorkStudyApplicationMapper applicationMapper;
    @Mock WorkStudyYearSettingMapper yearSettingMapper;
    @Mock SysUserMapper sysUserMapper;
    @Mock StudentProfileMapper studentProfileMapper;

    private WorkStudyService service;

    @BeforeEach
    void setUp() {
        service = new WorkStudyService(
                positionMapper, applicationMapper, /* timesheetMapper */ null,
                yearSettingMapper, /* workflowEngine */ null,
                /* workflowInstance */ null, /* taskInstance */ null,
                sysUserMapper, studentProfileMapper,
                /* formDataValidator */ null, new ObjectMapper());

        // Default: a generic eligible student (not gender/grade/college/aid blocked).
        SysUser u = new SysUser();
        u.setId(100L);
        u.setGender("male");
        lenient().when(sysUserMapper.selectById(100L)).thenReturn(u);

        StudentProfile sp = new StudentProfile();
        sp.setUserId(100L);
        sp.setGrade("2024");
        sp.setCollege("CS");
        sp.setAidLevel("none");
        lenient().when(studentProfileMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(sp);
    }

    private WorkStudyPosition position(String type, String year, int headcount) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(10L);
        p.setPositionType(type);
        p.setAcademicYear(year);
        p.setHeadcount(headcount);
        p.setHiredCount(0);
        return p;
    }

    private WorkStudyApplication hiredApp(Long positionId) {
        WorkStudyApplication a = new WorkStudyApplication();
        a.setId(positionId * 10);
        a.setStudentId(100L);
        a.setPositionId(positionId);
        a.setStatus("hired");
        return a;
    }

    private WorkStudyPosition heldPos(Long id, String type, String year) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setId(id);
        p.setPositionType(type);
        p.setAcademicYear(year);
        return p;
    }

    private WorkStudyYearSetting setting(int fixed, int temp) {
        WorkStudyYearSetting s = new WorkStudyYearSetting();
        s.setMaxFixedPerStudent(fixed);
        s.setMaxTempPerStudent(temp);
        return s;
    }

    // ----- eligibility filter throws first -----

    @Test
    void throws_whenIneligibleByGrade() {
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        p.setGradeLimits("[\"2023\"]");          // student is 2024 → blocked
        assertThatThrownBy(() -> service.enforceApplyEligibility(p, 100L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("不符合岗位申请条件");
    }

    // ----- year skip -----

    @Test
    void skipsCapCheck_whenPositionHasNoAcademicYear() {
        WorkStudyPosition p = position("fixed", null, 5);
        // No yearSettingMapper / applicationMapper interactions expected.
        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }

    @Test
    void skipsCapCheck_whenAcademicYearBlank() {
        WorkStudyPosition p = position("fixed", "   ", 5);
        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }

    // ----- no year_setting → defaults (fixed=1, temp=5) -----

    @Test
    void usesDefaultLimits_whenSettingMissing_andTriggersFixedAtOne() {
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        // student already holds 1 fixed in same year → DEFAULT_MAX_FIXED=1 hits
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(7L)));
        when(positionMapper.selectById(7L)).thenReturn(heldPos(7L, "fixed", "2024-2025"));

        assertThatThrownBy(() -> service.enforceApplyEligibility(p, 100L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("固定岗在岗数已达上限");
    }

    @Test
    void usesDefaultLimits_whenSettingFieldsNull() {
        WorkStudyPosition p = position("temporary", "2024-2025", 5);
        WorkStudyYearSetting s = new WorkStudyYearSetting();   // both limits null
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(s);
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }

    // ----- limit triggered -----

    @Test
    void throws_whenFixedHeldEqualsLimit() {
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(setting(2, 5));
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(1L), hiredApp(2L)));
        when(positionMapper.selectById(1L)).thenReturn(heldPos(1L, "fixed", "2024-2025"));
        when(positionMapper.selectById(2L)).thenReturn(heldPos(2L, "fixed", "2024-2025"));

        assertThatThrownBy(() -> service.enforceApplyEligibility(p, 100L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("固定岗");
    }

    @Test
    void throws_whenTempHeldEqualsLimit() {
        WorkStudyPosition p = position("temporary", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(setting(1, 2));
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(3L), hiredApp(4L)));
        when(positionMapper.selectById(3L)).thenReturn(heldPos(3L, "temporary", "2024-2025"));
        when(positionMapper.selectById(4L)).thenReturn(heldPos(4L, "temporary", "2024-2025"));

        assertThatThrownBy(() -> service.enforceApplyEligibility(p, 100L))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("临时岗");
    }

    // ----- not counted: different year / different type / null position -----

    @Test
    void differentYearHired_doesNotCountTowardLimit() {
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(setting(1, 5));
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(1L)));
        when(positionMapper.selectById(1L)).thenReturn(heldPos(1L, "fixed", "2023-2024"));

        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }

    @Test
    void differentTypeHired_doesNotCountTowardLimit() {
        // Applying for fixed; student already hired into a temporary in same year — should NOT block.
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(setting(1, 5));
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(1L)));
        when(positionMapper.selectById(1L)).thenReturn(heldPos(1L, "temporary", "2024-2025"));

        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }

    @Test
    void deletedPositionInHiredList_isSkipped() {
        WorkStudyPosition p = position("fixed", "2024-2025", 5);
        when(yearSettingMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(setting(1, 5));
        // Student has a stale hired application whose position was deleted (selectById → null).
        when(applicationMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(hiredApp(99L)));
        when(positionMapper.selectById(99L)).thenReturn(null);

        // Held-count = 0; default fixed limit = 1; should still allow.
        assertThatCode(() -> service.enforceApplyEligibility(p, 100L)).doesNotThrowAnyException();
    }
}
