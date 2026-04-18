package com.xg.common.config;

import com.xg.common.tenant.TenantSchemaInterceptor;
import org.apache.ibatis.plugin.Interceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MyBatisPlusConfig {

    @Bean
    public Interceptor tenantSchemaInterceptor() {
        return new TenantSchemaInterceptor();
    }
}
