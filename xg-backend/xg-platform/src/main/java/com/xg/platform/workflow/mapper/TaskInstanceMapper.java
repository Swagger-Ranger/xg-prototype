package com.xg.platform.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.workflow.model.TaskInstance;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskInstanceMapper extends BaseMapper<TaskInstance> {
}
