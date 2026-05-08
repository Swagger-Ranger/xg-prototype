package com.xg.business.academic.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.academic.dto.ClassScheduleUpsert;
import com.xg.business.academic.mapper.ClassScheduleMapper;
import com.xg.business.academic.model.ClassSchedule;
import com.xg.common.exception.BizException;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClassScheduleService {

    private final ClassScheduleMapper mapper;
    private final StudentProfileMapper studentProfileMapper;

    public List<ClassSchedule> list(Long classId, String termCode) {
        LambdaQueryWrapper<ClassSchedule> w = new LambdaQueryWrapper<>();
        if (classId != null) w.eq(ClassSchedule::getClassId, classId);
        if (termCode != null && !termCode.isBlank()) w.eq(ClassSchedule::getTermCode, termCode);
        w.orderByDesc(ClassSchedule::getUpdatedAt);
        return mapper.selectList(w);
    }

    public ClassSchedule getByClassAndTerm(Long classId, String termCode) {
        return mapper.selectOne(
                new LambdaQueryWrapper<ClassSchedule>()
                        .eq(ClassSchedule::getClassId, classId)
                        .eq(ClassSchedule::getTermCode, termCode)
                        .last("LIMIT 1"));
    }

    /**
     * Resolve the current student's class via student_profile, then return
     * the schedule for that class in the given term. Returns null when:
     *   · caller has no student_profile (non-student user)
     *   · the class hasn't had a schedule synced yet
     */
    public ClassSchedule getMine(Long userId, String termCode) {
        StudentProfile p = studentProfileMapper.selectOne(
                new LambdaQueryWrapper<StudentProfile>()
                        .eq(StudentProfile::getUserId, userId)
                        .last("LIMIT 1"));
        if (p == null || p.getClassId() == null) return null;
        return getByClassAndTerm(p.getClassId(), termCode);
    }

    @Transactional
    public ClassSchedule upsert(ClassScheduleUpsert req, Long operatorId) {
        ClassSchedule existing = getByClassAndTerm(req.getClassId(), req.getTermCode());
        if (existing == null) {
            ClassSchedule cs = new ClassSchedule();
            cs.setClassId(req.getClassId());
            cs.setTermCode(req.getTermCode());
            cs.setSource(req.getSource() != null ? req.getSource() : "manual");
            cs.setEntries(req.getEntries());
            cs.setImportedBy(operatorId);
            cs.setLastSyncedAt(OffsetDateTime.now());
            mapper.insert(cs);
            return mapper.selectById(cs.getId());
        }
        existing.setSource(req.getSource() != null ? req.getSource() : existing.getSource());
        existing.setEntries(req.getEntries());
        existing.setImportedBy(operatorId);
        existing.setLastSyncedAt(OffsetDateTime.now());
        mapper.updateById(existing);
        return mapper.selectById(existing.getId());
    }

    public void delete(Long id) {
        ClassSchedule cs = mapper.selectById(id);
        if (cs == null) throw new BizException("SCHEDULE_NOT_FOUND", "课表不存在");
        mapper.deleteById(id);
    }

    /** Bulk update last_synced_at for every schedule in the current tenant.
     *  Called by the daily scheduler — the actual sync from external sources
     *  will hook in here once that integration exists. */
    public int markAllSynced() {
        OffsetDateTime now = OffsetDateTime.now();
        List<ClassSchedule> all = mapper.selectList(null);
        for (ClassSchedule cs : all) {
            cs.setLastSyncedAt(now);
            mapper.updateById(cs);
        }
        return all.size();
    }
}
