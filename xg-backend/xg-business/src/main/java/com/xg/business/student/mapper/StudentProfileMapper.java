package com.xg.business.student.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.student.model.StudentProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface StudentProfileMapper extends BaseMapper<StudentProfile> {

    /**
     * Resolve sys_user.id of all students managed by the given counselor.
     * Traverses counselor_org_mapping → org_closure (descendant classes) → student_profile.class_id.
     * Returns an empty list when the counselor manages no org.
     */
    @Select({
            "SELECT DISTINCT sp.user_id",
            "FROM student_profile sp",
            "JOIN org_closure oc ON oc.descendant_id = sp.class_id",
            "JOIN counselor_org_mapping com ON com.org_id = oc.ancestor_id",
            "WHERE com.counselor_id = #{counselorId}",
            "  AND sp.deleted_at IS NULL"
    })
    List<Long> findStudentUserIdsByCounselor(@Param("counselorId") Long counselorId);
}
