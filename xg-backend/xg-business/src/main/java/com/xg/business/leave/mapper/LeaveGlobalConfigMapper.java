package com.xg.business.leave.mapper;

import com.xg.business.leave.model.LeaveGlobalConfig;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;

/**
 * 租户级全局请假策略读写。表 {@code leave_global_config} 在租户 schema 内,单行;
 * 不存在时按"不限"语义降级,所以 read 路径用 selectOne 不抛错。
 */
@Mapper
public interface LeaveGlobalConfigMapper {

    @Results({
            @Result(column = "tenant_id", property = "tenantId"),
            @Result(column = "term_max_days", property = "termMaxDays"),
            @Result(column = "require_proof", property = "requireProof"),
            @Result(column = "updated_at", property = "updatedAt"),
            @Result(column = "updated_by", property = "updatedBy"),
    })
    @Select("""
            SELECT tenant_id, term_max_days, require_proof, updated_at, updated_by
              FROM leave_global_config
             LIMIT 1
            """)
    LeaveGlobalConfig selectOne();

    /**
     * Upsert 单行。租户 schema 内 PK=tenant_id 保证只会有一条;
     * ON CONFLICT 走主键升级 term_max_days / require_proof / updated_*。
     * 调用方需要先读 current 把不想动的列回填,**不传 NULL 表示"保留旧值"**(NULL
     * 在 termMaxDays 里有"不限"语义,不能复用 COALESCE 做 partial update)。
     */
    @Insert("""
            INSERT INTO leave_global_config
                (tenant_id, term_max_days, require_proof, updated_at, updated_by)
            VALUES
                (#{tenantId}, #{termMaxDays}, #{requireProof}, NOW(), #{operatorId})
            ON CONFLICT (tenant_id) DO UPDATE
               SET term_max_days = EXCLUDED.term_max_days,
                   require_proof = EXCLUDED.require_proof,
                   updated_at    = NOW(),
                   updated_by    = EXCLUDED.updated_by
            """)
    int upsert(@Param("tenantId") String tenantId,
               @Param("termMaxDays") BigDecimal termMaxDays,
               @Param("requireProof") boolean requireProof,
               @Param("operatorId") Long operatorId);
}
