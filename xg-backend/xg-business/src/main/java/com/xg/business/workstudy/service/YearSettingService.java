package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.dto.YearSettingUpsertRequest;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.mapper.WorkStudyYearSettingMapper;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.business.workstudy.model.WorkStudyYearSetting;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class YearSettingService {

    private final WorkStudyYearSettingMapper settingMapper;
    private final WorkStudyPositionMapper positionMapper;

    public List<WorkStudyYearSetting> list() {
        return settingMapper.selectList(new LambdaQueryWrapper<WorkStudyYearSetting>()
                .orderByDesc(WorkStudyYearSetting::getAcademicYear));
    }

    public WorkStudyYearSetting findByYear(String academicYear) {
        return settingMapper.selectOne(new LambdaQueryWrapper<WorkStudyYearSetting>()
                .eq(WorkStudyYearSetting::getAcademicYear, academicYear));
    }

    @Transactional
    public WorkStudyYearSetting upsert(YearSettingUpsertRequest req) {
        WorkStudyYearSetting existing = findByYear(req.getAcademicYear());
        if (existing != null) {
            if (req.getMaxFixedPerStudent() != null) existing.setMaxFixedPerStudent(req.getMaxFixedPerStudent());
            if (req.getMaxTempPerStudent() != null) existing.setMaxTempPerStudent(req.getMaxTempPerStudent());
            if (req.getApplicationOpen() != null) existing.setApplicationOpen(req.getApplicationOpen());
            if (req.getDefaultAllowSelfArrange() != null) existing.setDefaultAllowSelfArrange(req.getDefaultAllowSelfArrange());
            // 三阶段窗口:upsert 时无脑透传(包括 null) — 让管理员能用 null 清空已设的窗口
            existing.setPositionWindowStart(req.getPositionWindowStart());
            existing.setPositionWindowEnd(req.getPositionWindowEnd());
            existing.setApplicationWindowStart(req.getApplicationWindowStart());
            existing.setApplicationWindowEnd(req.getApplicationWindowEnd());
            existing.setSalaryWindowStart(req.getSalaryWindowStart());
            existing.setSalaryWindowEnd(req.getSalaryWindowEnd());
            settingMapper.updateById(existing);
            return existing;
        }
        WorkStudyYearSetting s = new WorkStudyYearSetting();
        s.setAcademicYear(req.getAcademicYear());
        s.setMaxFixedPerStudent(req.getMaxFixedPerStudent() == null ? 1 : req.getMaxFixedPerStudent());
        s.setMaxTempPerStudent(req.getMaxTempPerStudent() == null ? 5 : req.getMaxTempPerStudent());
        s.setApplicationOpen(Boolean.TRUE.equals(req.getApplicationOpen()));
        s.setDefaultAllowSelfArrange(Boolean.TRUE.equals(req.getDefaultAllowSelfArrange()));
        s.setPositionWindowStart(req.getPositionWindowStart());
        s.setPositionWindowEnd(req.getPositionWindowEnd());
        s.setApplicationWindowStart(req.getApplicationWindowStart());
        s.setApplicationWindowEnd(req.getApplicationWindowEnd());
        s.setSalaryWindowStart(req.getSalaryWindowStart());
        s.setSalaryWindowEnd(req.getSalaryWindowEnd());
        settingMapper.insert(s);
        return s;
    }

    /**
     * 当前时间是否落在窗口 [start, end] 内。start/end 均可为 null,任一边为 null
     * 视为"无下/上限"。两边都 null = 始终允许。
     */
    public static boolean inWindow(OffsetDateTime start, OffsetDateTime end) {
        OffsetDateTime now = OffsetDateTime.now();
        if (start != null && now.isBefore(start)) return false;
        if (end != null && now.isAfter(end)) return false;
        return true;
    }

    /**
     * 把 {@code fromYear} 的所有岗位（fixed/temporary）复制到 {@code toYear}，
     * 新岗位 status=draft（待管理员二次确认），hired_count 清零。不自动续聘 applications。
     * 返回复制条数。
     */
    @Transactional
    public int syncPositionsFromYear(String toYear, String fromYear) {
        if (toYear == null || fromYear == null || toYear.equals(fromYear)) {
            throw new BizException("INVALID_ARGUMENT", "toYear / fromYear 必须非空且不相等");
        }
        List<WorkStudyPosition> source = positionMapper.selectList(new LambdaQueryWrapper<WorkStudyPosition>()
                .eq(WorkStudyPosition::getAcademicYear, fromYear));
        if (source.isEmpty()) return 0;

        int copied = 0;
        for (WorkStudyPosition src : source) {
            WorkStudyPosition p = new WorkStudyPosition();
            // copy core
            p.setTitle(src.getTitle());
            p.setPositionType(src.getPositionType());
            p.setDepartmentName(src.getDepartmentName());
            p.setDescription(src.getDescription());
            p.setRequirements(src.getRequirements());
            p.setPreferFinancialAid(src.getPreferFinancialAid());
            p.setWeeklyHours(src.getWeeklyHours());
            p.setHeadcount(src.getHeadcount());
            p.setHiredCount(0);
            p.setStatus("draft");
            p.setStartDate(src.getStartDate());
            p.setEndDate(src.getEndDate());
            p.setCreatorId(src.getCreatorId());
            // copy V051 fields
            p.setEmployerId(src.getEmployerId());
            p.setAcademicYear(toYear);
            p.setOwnerUserId(src.getOwnerUserId());
            p.setOwnerPhone(src.getOwnerPhone());
            p.setCampus(src.getCampus());
            p.setWorkLocation(src.getWorkLocation());
            p.setDurationMonths(src.getDurationMonths());
            p.setTimeSlots(src.getTimeSlots());
            p.setApplicationDeadline(src.getApplicationDeadline());
            p.setSalaryUnit(src.getSalaryUnit());
            p.setSalaryAmount(src.getSalaryAmount());
            p.setReason(src.getReason());
            p.setGenderLimit(src.getGenderLimit());
            p.setAidLevels(src.getAidLevels());
            p.setGradeLimits(src.getGradeLimits());
            p.setCollegeLimits(src.getCollegeLimits());
            p.setSelfArranged(src.getSelfArranged());
            positionMapper.insert(p);
            copied++;
        }
        log.info("Synced {} positions from {} → {}", copied, fromYear, toYear);
        return copied;
    }
}
