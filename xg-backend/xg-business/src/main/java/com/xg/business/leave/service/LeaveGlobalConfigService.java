package com.xg.business.leave.service;

import com.xg.business.leave.mapper.LeaveGlobalConfigMapper;
import com.xg.business.leave.model.LeaveGlobalConfig;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * 租户级全局请假策略 service。当前只承载「学期累计上限」一项,后续单次最大天数 /
 * 连续请假冷却期等也往这里挂。
 */
@Service
@RequiredArgsConstructor
public class LeaveGlobalConfigService {

    private static final BigDecimal MAX_TERM_CAP = BigDecimal.valueOf(365);

    private final LeaveGlobalConfigMapper mapper;

    /** 读全局配置;不存在时返回一条全 null 占位(语义=不限)。 */
    public LeaveGlobalConfig get() {
        LeaveGlobalConfig row = mapper.selectOne();
        if (row != null) return row;
        LeaveGlobalConfig empty = new LeaveGlobalConfig();
        empty.setTenantId(currentTenantId());
        return empty;
    }

    /** 直接拿当前 termMaxDays(可能为 null = 不限)。 */
    public BigDecimal getTermMaxDays() {
        LeaveGlobalConfig row = mapper.selectOne();
        return row == null ? null : row.getTermMaxDays();
    }

    /** 写学期累计上限。null = 不限;<=0 / >365 / 含小数都拒绝(只接受整数天)。
     *  require_proof 保留当前值(只动 term_max_days 一列)。 */
    @Transactional
    public LeaveGlobalConfig updateTermMaxDays(BigDecimal termMaxDays, Long operatorId) {
        if (termMaxDays != null) {
            if (termMaxDays.signum() <= 0) {
                throw new BizException("INVALID_TERM_MAX", "学期累计上限必须为正数");
            }
            if (termMaxDays.compareTo(MAX_TERM_CAP) > 0) {
                throw new BizException("INVALID_TERM_MAX", "学期累计上限不应超过 365 天");
            }
            // stripTrailingZeros() 把 5.0 变 5,scale > 0 的就只剩真有小数位的(如 5.5)
            if (termMaxDays.stripTrailingZeros().scale() > 0) {
                throw new BizException("INVALID_TERM_MAX", "学期累计上限只接受整数天");
            }
        }
        boolean keepProof = currentRequireProof();
        mapper.upsert(currentTenantId(), termMaxDays, keepProof, operatorId);
        return get();
    }

    /** 写「是否要求证明材料」开关。term_max_days 保留当前值。 */
    @Transactional
    public LeaveGlobalConfig updateRequireProof(boolean requireProof, Long operatorId) {
        BigDecimal keepCap = currentTermMaxDays();
        mapper.upsert(currentTenantId(), keepCap, requireProof, operatorId);
        return get();
    }

    private BigDecimal currentTermMaxDays() {
        LeaveGlobalConfig row = mapper.selectOne();
        return row == null ? null : row.getTermMaxDays();
    }

    private boolean currentRequireProof() {
        LeaveGlobalConfig row = mapper.selectOne();
        return row != null && Boolean.TRUE.equals(row.getRequireProof());
    }

    private static String currentTenantId() {
        String tid = TenantContext.getTenantId();
        return (tid == null || tid.isBlank()) ? "default" : tid;
    }
}
