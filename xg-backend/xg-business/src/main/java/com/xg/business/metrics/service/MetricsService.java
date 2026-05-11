package com.xg.business.metrics.service;

import com.xg.business.metrics.dto.MetricQueryRequest;
import com.xg.business.metrics.dto.MetricQueryResponse;
import com.xg.business.metrics.dto.MetricScope;
import com.xg.business.metrics.enums.MetricId;
import com.xg.business.metrics.mapper.MetricMapper;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * NL 问数 service。把 LLM 给的 {metric_id, dimensions, filters, compareTo} dispatch 到具体
 * 算法,scope 由 MetricsScopeResolver 强注入 — controller 已经 403 过 DENIED,这里假设合法。
 *
 * <p>P0 仅落地 leave.count 一条完整链路,其他 11 条 enum 已在 MetricId 注册,逐条按同样
 * 模式叠加即可(SQL → 这里加 case → 维度/时间窗参数固化)。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MetricsService {

    private final MetricMapper metricMapper;

    public MetricQueryResponse query(MetricQueryRequest req, MetricScope scope) {
        if (scope.getKind() == MetricScope.Kind.DENIED) {
            // controller 应该已经拦了,双保险
            throw new BizException("METRICS_DENIED", "你的角色没有问数权限");
        }
        MetricId metric = MetricId.fromCode(req.getMetric())
                .orElseThrow(() -> new BizException("INVALID_METRIC", "未知 metric: " + req.getMetric()));

        Map<String, Object> filters = req.getFilters() == null ? Map.of() : req.getFilters();
        TimeWindow window = resolveTimeWindow(filters);
        List<String> dimensions = req.getDimensions() == null ? List.of() : req.getDimensions();

        return switch (metric) {
            case LEAVE_COUNT -> leaveCount(scope, dimensions, filters, window, req.getCompareTo());
            // 其他 11 个待逐条接入,先抛清晰错误避免假成功
            default -> throw new BizException("METRIC_NOT_IMPLEMENTED",
                    "metric " + metric.code() + " 暂未实现,P0 先放出 leave.count");
        };
    }

    /* ───────── leave.count ───────── */

    private MetricQueryResponse leaveCount(
            MetricScope scope,
            List<String> dimensions,
            Map<String, Object> filters,
            TimeWindow window,
            String compareTo) {

        Long collegeIdFilter = scope.getKind() == MetricScope.Kind.DEAN_OF_COLLEGE
                ? scope.getCollegeId() : null;
        String leaveTypeCode = asStr(filters.get("leave_type"));
        String status = asStr(filters.get("status"));

        // 维度白名单:leave.count 支持 college / leave_type / 无维度(单值)
        String dim = dimensions.isEmpty() ? null : dimensions.get(0);
        if (dim != null && !dim.equals("college") && !dim.equals("leave_type")) {
            throw new BizException("INVALID_DIMENSION",
                    "leave.count 不支持维度 " + dim + ",可选 college / leave_type");
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        String chartType;

        if ("college".equals(dim)) {
            // 学院维度只对全校视角有效;院长 scope 下降级成"自己学院 vs 全校"对比
            if (scope.getKind() == MetricScope.Kind.DEAN_OF_COLLEGE) {
                rows.addAll(rowsForDeanCollegeVsSchool(scope, window, status));
                chartType = "bar";
            } else {
                rows.addAll(metricMapper.leaveCountByCollege(window.since, window.until, status));
                chartType = "bar";
            }
        } else if ("leave_type".equals(dim)) {
            rows.addAll(metricMapper.leaveCountByLeaveType(collegeIdFilter, window.since, window.until, status));
            chartType = "bar";
        } else {
            Long total = metricMapper.leaveCountTotal(collegeIdFilter, window.since, window.until, leaveTypeCode, status);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("value", total == null ? 0 : total);
            rows.add(r);
            chartType = "number";
        }

        Map<String, Object> comparison = null;
        if ("yoy".equals(compareTo) || "last_period".equals(compareTo)) {
            TimeWindow compareWindow = "yoy".equals(compareTo)
                    ? window.shiftYear(-1)
                    : window.shiftPeriod(-1);
            Long prev = metricMapper.leaveCountTotal(collegeIdFilter, compareWindow.since, compareWindow.until, leaveTypeCode, status);
            // 当前期总数(没切维度时直接用 rows[0].value,否则单独算)
            long cur = (dim == null)
                    ? ((Number) rows.get(0).get("value")).longValue()
                    : metricMapper.leaveCountTotal(collegeIdFilter, window.since, window.until, leaveTypeCode, status);
            long prevV = prev == null ? 0 : prev;
            comparison = new LinkedHashMap<>();
            comparison.put("value", prevV);
            comparison.put("delta", cur - prevV);
            comparison.put("delta_pct", prevV == 0 ? null : Math.round((cur - prevV) * 1000.0 / prevV) / 10.0);
            comparison.put("period", "yoy".equals(compareTo) ? "去年同期" : "上一同长度时段");
        }

        return MetricQueryResponse.builder()
                .metric(MetricId.LEAVE_COUNT.code())
                .chartType(chartType)
                .rows(rows)
                .context(buildContext(scope, window))
                .comparison(comparison)
                .build();
    }

    /** 院长 scope 下"college" 维度的特殊渲染:只两行 — 自己学院 + 全校均值。 */
    private List<Map<String, Object>> rowsForDeanCollegeVsSchool(
            MetricScope scope, TimeWindow window, String status) {
        Long mine = metricMapper.leaveCountTotal(scope.getCollegeId(), window.since, window.until, null, status);
        List<Map<String, Object>> all = metricMapper.leaveCountByCollege(window.since, window.until, status);
        double avg = all.isEmpty() ? 0.0
                : all.stream().mapToLong(r -> ((Number) r.get("value")).longValue()).average().orElse(0);
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Object> selfRow = new LinkedHashMap<>();
        selfRow.put("label", scope.getCollegeName() + "(本院)");
        selfRow.put("value", mine == null ? 0 : mine);
        out.add(selfRow);
        Map<String, Object> avgRow = new LinkedHashMap<>();
        avgRow.put("label", "全校均值");
        avgRow.put("value", Math.round(avg * 10.0) / 10.0);
        out.add(avgRow);
        return out;
    }

    /* ───────── 时间窗解析 ───────── */

    private record TimeWindow(OffsetDateTime since, OffsetDateTime until, String label) {
        TimeWindow shiftYear(int years) {
            return new TimeWindow(
                    since == null ? null : since.plusYears(years),
                    until == null ? null : until.plusYears(years),
                    "去年同期");
        }
        /** 平移一个同长度时段(本月 → 上月,本周 → 上周)。 */
        TimeWindow shiftPeriod(int n) {
            if (since == null || until == null) return this;
            long lenSec = until.toEpochSecond() - since.toEpochSecond();
            return new TimeWindow(
                    since.minusSeconds(-n * lenSec),
                    until.minusSeconds(-n * lenSec),
                    "上一同长度时段");
        }
    }

    private TimeWindow resolveTimeWindow(Map<String, Object> filters) {
        // 优先级:explicit since/until > term_code > current_term
        String sinceStr = asStr(filters.get("since"));
        String untilStr = asStr(filters.get("until"));
        if (sinceStr != null || untilStr != null) {
            return new TimeWindow(parseIso(sinceStr), parseIso(untilStr), "自定义区间");
        }
        String termCode = asStr(filters.get("term_code"));
        Map<String, Object> termRow = (termCode != null)
                ? metricMapper.findTermByCode(termCode)
                : metricMapper.findCurrentTerm();
        if (termRow != null && termRow.get("start_date") != null && termRow.get("end_date") != null) {
            LocalDate sd = (LocalDate) termRow.get("start_date");
            LocalDate ed = (LocalDate) termRow.get("end_date");
            return new TimeWindow(
                    sd.atStartOfDay().atOffset(ZoneOffset.ofHours(8)),
                    ed.plusDays(1).atStartOfDay().atOffset(ZoneOffset.ofHours(8)),
                    (String) termRow.get("name"));
        }
        return new TimeWindow(null, null, "不限时间");
    }

    private Map<String, Object> buildContext(MetricScope scope, TimeWindow window) {
        Map<String, Object> ctx = new HashMap<>();
        if (scope.getKind() == MetricScope.Kind.DEAN_OF_COLLEGE) {
            ctx.put("scope", "college");
            ctx.put("college_name", scope.getCollegeName());
        } else {
            ctx.put("scope", "school");
        }
        ctx.put("period", window.label);
        if (window.since != null) ctx.put("since", window.since.toLocalDate().toString());
        if (window.until != null) ctx.put("until", window.until.toLocalDate().toString());
        return ctx;
    }

    private static String asStr(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static OffsetDateTime parseIso(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return OffsetDateTime.parse(s);
        } catch (Exception e) {
            // YYYY-MM-DD fallback
            try {
                return LocalDate.parse(s).atStartOfDay().atOffset(ZoneOffset.ofHours(8));
            } catch (Exception ignored) {
                return null;
            }
        }
    }
}
