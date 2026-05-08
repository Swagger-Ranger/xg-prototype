package com.xg.platform.tenant.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.xg.platform.tenant.model.Tenant;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TenantMapper extends BaseMapper<Tenant> {
}
