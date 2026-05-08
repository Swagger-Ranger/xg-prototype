package com.xg.business.workstudy.service;

import com.xg.business.workstudy.mapper.WorkStudySalaryMapper;
import com.xg.business.workstudy.mapper.WorkStudySettlementMapper;
import com.xg.business.workstudy.model.WorkStudySalary;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Walks every settled timesheet in the tenant and materializes a corresponding
 * {@code work_study_salary} row (status=pending, amount=hours*rate snapshot).
 * Idempotent via the partial unique index {@code uq_ws_salary_timesheet}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudySalarySettlementService {

    private final WorkStudySettlementMapper settlementMapper;
    private final WorkStudySalaryMapper salaryMapper;
    private final DataSource dataSource;

    /**
     * Settle all tenants. Used by the daily scheduler and the manual trigger.
     * Per-tenant failures are logged and do not abort the loop.
     */
    public int runOnce(String source) {
        List<String[]> tenants = listActiveTenants();
        int total = 0;
        for (String[] t : tenants) {
            String tenantId = t[0];
            String schema = t[1];
            try {
                TenantContext.setTenantId(tenantId);
                TenantContext.setSchemaName(schema);
                int inserted = settleCurrentTenant();
                total += inserted;
                log.info("work-study salary settle tenant={} inserted={}", tenantId, inserted);
            } catch (Exception e) {
                log.warn("work-study salary settle failed tenant={}", tenantId, e);
            } finally {
                TenantContext.clear();
            }
        }
        log.info("work-study salary settle [{}] done: tenants={} total_inserted={}", source, tenants.size(), total);
        return total;
    }

    public int settleCurrentTenant() {
        List<Map<String, Object>> rows = settlementMapper.findSettleableTimesheets();
        int inserted = 0;
        for (Map<String, Object> row : rows) {
            try {
                if (insertOne(row)) inserted++;
            } catch (DuplicateKeyException ignore) {
                // Concurrent settle or retry after partial failure — unique index already has it.
            } catch (Exception e) {
                log.warn("work-study salary insert failed timesheet_id={}", row.get("timesheet_id"), e);
            }
        }
        return inserted;
    }

    private boolean insertOne(Map<String, Object> row) {
        BigDecimal hours = toBigDecimal(row.get("hours_final"));
        BigDecimal rate = toBigDecimal(row.get("hourly_rate"));
        if (hours == null || rate == null) {
            log.warn("skip salary: missing hours or rate, timesheet_id={}", row.get("timesheet_id"));
            return false;
        }
        BigDecimal amount = hours.multiply(rate).setScale(2, RoundingMode.HALF_UP);

        WorkStudySalary s = new WorkStudySalary();
        s.setTimesheetId(toLong(row.get("timesheet_id")));
        s.setStudentId(toLong(row.get("student_id")));
        s.setPositionId(toLong(row.get("position_id")));
        s.setMonth((String) row.get("month"));
        s.setHours(hours);
        s.setHourlyRate(rate);
        s.setAmount(amount);
        s.setStatus("pending");
        salaryMapper.insert(s);
        return true;
    }

    private List<String[]> listActiveTenants() {
        List<String[]> result = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT id, schema_name FROM public.tenant WHERE status = 'active'")) {
            while (rs.next()) {
                result.add(new String[]{rs.getString(1), rs.getString(2)});
            }
        } catch (Exception e) {
            log.warn("list tenants failed", e);
        }
        return result;
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return new BigDecimal(v.toString());
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        return Long.parseLong(v.toString());
    }
}
