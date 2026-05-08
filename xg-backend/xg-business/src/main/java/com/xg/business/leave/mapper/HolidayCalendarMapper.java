package com.xg.business.leave.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Lookup of {@code holiday_calendar} entries for the leave-day calculator.
 * Reads stay narrow — full CRUD lands with the admin UI in P1.
 */
@Mapper
public interface HolidayCalendarMapper {

    /**
     * Holidays + compensatory workdays in {@code [from, to]} (inclusive).
     * Each row exposes {@code date} (LocalDate) and {@code type} (String).
     * Returned as a raw map list to keep the mapper free of an extra model class
     * — the calculator only needs date+type, nothing more.
     */
    @Select("""
            SELECT date, type
              FROM holiday_calendar
             WHERE tenant_id = #{tenantId}
               AND date BETWEEN #{from} AND #{to}
            """)
    List<Map<String, Object>> findInRange(@Param("tenantId") String tenantId,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to);

    /** Returns all configured holidays for the tenant — used by the read-only listing endpoint. */
    @Select("""
            SELECT date, name, type, note
              FROM holiday_calendar
             WHERE tenant_id = #{tenantId}
             ORDER BY date ASC
            """)
    List<Map<String, Object>> listAll(@Param("tenantId") String tenantId);
}
