package com.xg.platform.crisis.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.crisis.model.CrisisSignal;
import org.apache.ibatis.annotations.Mapper;

/** crisis_signal 持久层。租户隔离由 schema-per-tenant 拦截器负责（与 care 一致）。 */
@Mapper
public interface CrisisSignalMapper extends BaseMapper<CrisisSignal> {
}
