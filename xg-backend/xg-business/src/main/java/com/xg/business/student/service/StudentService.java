package com.xg.business.student.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.student.dto.StudentQueryRequest;
import com.xg.business.student.dto.StudentView;
import com.xg.business.student.mapper.StudentViewMapper;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudentService {

    private final StudentViewMapper studentViewMapper;

    public PageResult<StudentView> list(StudentQueryRequest query) {
        Page<StudentView> page = query.toPage();
        IPage<StudentView> result = studentViewMapper.selectStudentPage(
                page, query.getKeyword(), query.getGrade(), query.getStatus());
        return PageResult.of(result);
    }

    public StudentView detail(Long id) {
        StudentView student = studentViewMapper.selectStudentById(id);
        if (student == null) {
            throw new BizException("STUDENT_NOT_FOUND", "学生信息不存在");
        }
        return student;
    }
}
