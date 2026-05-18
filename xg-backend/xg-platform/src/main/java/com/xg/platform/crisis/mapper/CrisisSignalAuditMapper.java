package com.xg.platform.crisis.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.crisis.model.CrisisSignalAudit;
import org.apache.ibatis.annotations.Mapper;

/** crisis_signal_audit 持久层。租户隔离由 schema-per-tenant 拦截器负责（与 crisis_signal 一致）。 */
@Mapper
public interface CrisisSignalAuditMapper extends BaseMapper<CrisisSignalAudit> {
}
