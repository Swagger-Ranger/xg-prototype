package com.xg.business.worklog.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.business.worklog.model.WorkLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WorkLogMapper extends BaseMapper<WorkLog> {
}
