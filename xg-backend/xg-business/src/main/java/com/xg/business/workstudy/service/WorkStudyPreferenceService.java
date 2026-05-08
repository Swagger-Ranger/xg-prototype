package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.workstudy.dto.WorkStudyPreferenceUpsertRequest;
import com.xg.business.workstudy.mapper.StudentWorkStudyPreferenceMapper;
import com.xg.business.workstudy.model.StudentWorkStudyPreference;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkStudyPreferenceService {

    private final StudentWorkStudyPreferenceMapper mapper;

    /** 取当前学生的偏好；不存在时返回一行字段全空的对象（不入库），由前端判空。 */
    public StudentWorkStudyPreference findByStudent(Long studentId) {
        StudentWorkStudyPreference row = mapper.selectOne(new LambdaQueryWrapper<StudentWorkStudyPreference>()
                .eq(StudentWorkStudyPreference::getStudentId, studentId));
        if (row != null) return row;
        StudentWorkStudyPreference empty = new StudentWorkStudyPreference();
        empty.setStudentId(studentId);
        empty.setCourseSchedule("{}");
        empty.setPositionPref("{}");
        return empty;
    }

    @Transactional
    public StudentWorkStudyPreference upsert(Long studentId, WorkStudyPreferenceUpsertRequest req) {
        StudentWorkStudyPreference existing = mapper.selectOne(new LambdaQueryWrapper<StudentWorkStudyPreference>()
                .eq(StudentWorkStudyPreference::getStudentId, studentId));
        String courseJson = req.getCourseSchedule() == null ? "{}" : req.getCourseSchedule();
        String prefJson   = req.getPositionPref()   == null ? "{}" : req.getPositionPref();
        if (existing != null) {
            existing.setCourseSchedule(courseJson);
            existing.setPositionPref(prefJson);
            mapper.updateById(existing);
            return existing;
        }
        StudentWorkStudyPreference row = new StudentWorkStudyPreference();
        row.setStudentId(studentId);
        row.setCourseSchedule(courseJson);
        row.setPositionPref(prefJson);
        mapper.insert(row);
        return row;
    }
}
