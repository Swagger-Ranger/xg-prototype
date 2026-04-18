package com.xg.business.complaint.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.complaint.model.Complaint;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ComplaintMapper extends BaseMapper<Complaint> {
}
