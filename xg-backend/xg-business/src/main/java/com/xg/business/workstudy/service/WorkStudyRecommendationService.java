package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.student.mapper.StudentProfileMapper;
import com.xg.business.student.model.StudentProfile;
import com.xg.business.workstudy.dto.PositionRecommendation;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.StudentWorkStudyPreference;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.platform.insight.client.AiSidecarClient;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * B3 学生侧"为你推荐"核心：Java 做确定性打分（保证可解释 + 可预测），AI 只写理由文本。
 *
 * <p>评分维度（合计约 -30 .. 100）：
 * <ul>
 *   <li>困难生策略 × 学生 aid_level 交互（bonus +25 / reserved +20 / only +30）</li>
 *   <li>偏好匹配：campus / types / 薪资范围（rate_min, rate_max）</li>
 *   <li>课表冲突：扣 30（基于 student.course_schedule × position.time_slots）</li>
 * </ul>
 *
 * <p>课表 vs 时段冲突的简化：student 用 5 段钟点制 (p1-p5)，position 用 HH:mm 时段。
 * P0 用近似映射（p1=8-10 / p2=10-12 / p3=14-16 / p4=16-18 / p5=19-21）判断同日有无重叠。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudyRecommendationService {

    private final WorkStudyPositionMapper positionMapper;
    private final WorkStudyPreferenceService preferenceService;
    private final SysUserMapper sysUserMapper;
    private final StudentProfileMapper studentProfileMapper;
    private final WorkStudyService workStudyService;
    private final AiSidecarClient aiSidecarClient;
    private final ObjectMapper objectMapper;

    private static final Map<String, int[]> PERIOD_HOURS = Map.of(
            "p1", new int[]{8, 10},
            "p2", new int[]{10, 12},
            "p3", new int[]{14, 16},
            "p4", new int[]{16, 18},
            "p5", new int[]{19, 21}
    );

    public List<PositionRecommendation> recommendForStudent(Long studentId, int topK) {
        if (topK <= 0) topK = 5;
        if (topK > 20) topK = 20;

        SysUser user = sysUserMapper.selectById(studentId);
        if (user == null) return List.of();
        StudentProfile profile = studentProfileMapper.selectOne(new LambdaQueryWrapper<StudentProfile>()
                .eq(StudentProfile::getUserId, studentId));
        StudentWorkStudyPreference pref = preferenceService.findByStudent(studentId);
        Map<String, Object> prefMap = parseJson(pref.getPositionPref());
        Map<String, List<String>> courseSchedule = parseSchedule(pref.getCourseSchedule());
        String aidLevel = profile == null ? null : profile.getAidLevel();
        boolean isAidStudent = aidLevel != null && !aidLevel.isBlank() && !"none".equalsIgnoreCase(aidLevel);

        // 用 WorkStudyService 的 isEligible 做学生侧可见性过滤（status=open + 资格匹配 + 暂停 + 满员）
        List<WorkStudyPosition> openPositions = positionMapper.selectList(
                new LambdaQueryWrapper<WorkStudyPosition>().eq(WorkStudyPosition::getStatus, "open"));

        WorkStudyService.StudentEligibility eligibility = new WorkStudyService.StudentEligibility(
                user.getGender(),
                profile == null ? null : profile.getGrade(),
                profile == null ? null : profile.getCollege(),
                aidLevel);
        List<WorkStudyPosition> eligible = openPositions.stream()
                .filter(p -> workStudyService.isEligible(p, eligibility))
                .toList();

        List<PositionRecommendation> scored = new ArrayList<>(eligible.size());
        for (WorkStudyPosition p : eligible) {
            scored.add(scoreOne(p, isAidStudent, aidLevel, prefMap, courseSchedule));
        }
        scored.sort(Comparator.comparingDouble(PositionRecommendation::getScore).reversed());
        List<PositionRecommendation> top = scored.size() > topK ? scored.subList(0, topK) : scored;

        // AI 写理由（失败降级：reason 留空，前端用 scoringSignals 兜底显示 tags）
        try {
            Map<String, Object> studentBrief = new LinkedHashMap<>();
            studentBrief.put("name", user.getRealName());
            studentBrief.put("aid_level", aidLevel == null ? "none" : aidLevel);
            studentBrief.put("grade", profile == null ? null : profile.getGrade());
            studentBrief.put("college", profile == null ? null : profile.getCollege());
            studentBrief.put("preference", prefMap);

            List<Map<String, Object>> positionBriefs = new ArrayList<>();
            for (PositionRecommendation r : top) {
                Map<String, Object> b = new LinkedHashMap<>();
                b.put("position_id", r.getPositionId());
                b.put("title", r.getTitle());
                b.put("department_name", r.getDepartmentName());
                b.put("campus", r.getCampus());
                b.put("salary_unit", r.getSalaryUnit());
                b.put("salary_amount", r.getSalaryAmount());
                b.put("financial_aid_policy", r.getFinancialAidPolicy());
                b.put("score", r.getScore());
                b.put("signals", r.getScoringSignals());
                positionBriefs.add(b);
            }
            Map<Long, String> reasons = aiSidecarClient.writeRecommendationReasons(studentBrief, positionBriefs);
            if (reasons != null) {
                for (PositionRecommendation r : top) {
                    String s = reasons.get(r.getPositionId());
                    if (s != null) r.setReason(s);
                }
            }
        } catch (Exception e) {
            log.warn("AI write recommendation reasons failed: {}", e.getMessage());
        }
        return top;
    }

    private PositionRecommendation scoreOne(WorkStudyPosition p,
                                            boolean isAidStudent, String aidLevel,
                                            Map<String, Object> prefMap,
                                            Map<String, List<String>> courseSchedule) {
        PositionRecommendation r = new PositionRecommendation();
        r.setPositionId(p.getId());
        r.setTitle(p.getTitle());
        r.setDepartmentName(p.getDepartmentName());
        r.setCampus(p.getCampus());
        r.setWorkLocation(p.getWorkLocation());
        r.setSalaryUnit(p.getSalaryUnit());
        r.setSalaryAmount(p.getSalaryAmount());
        r.setHourlyRate(p.getHourlyRate());
        r.setWeeklyHours(p.getWeeklyHours());
        r.setHeadcount(p.getHeadcount());
        r.setHiredCount(p.getHiredCount());
        r.setFinancialAidPolicy(p.getFinancialAidPolicy());
        r.setReservedCount(p.getReservedCount());

        double score = 50.0;
        Map<String, Object> signals = r.getScoringSignals();

        // 困难生策略 × 学生
        String policy = p.getFinancialAidPolicy() == null ? "none" : p.getFinancialAidPolicy();
        if (isAidStudent) {
            switch (policy) {
                case "only" -> { score += 30; signals.put("aid_policy", "only:+30"); }
                case "bonus" -> { score += 25; signals.put("aid_policy", "bonus:+25"); }
                case "reserved" -> { score += 20; signals.put("aid_policy", "reserved:+20"); }
                default -> signals.put("aid_policy", "none");
            }
        } else {
            // 'only' 已被 isEligible 过滤，这里不会出现
            signals.put("aid_policy", "n/a");
        }

        // 偏好匹配 — campus
        Object prefCampus = prefMap.get("campus");
        if (prefCampus instanceof String s && !s.isBlank() && s.equals(p.getCampus())) {
            score += 15;
            signals.put("campus_match", "+15");
        }

        // 偏好匹配 — 岗位类型
        Object prefTypesRaw = prefMap.get("types");
        if (prefTypesRaw instanceof List<?> types && types.contains(p.getPositionType())) {
            score += 10;
            signals.put("type_match", "+10");
        }

        // 偏好匹配 — 薪资范围（以 salaryAmount 优先；fallback hourlyRate）
        BigDecimal rate = p.getSalaryAmount() != null ? p.getSalaryAmount() : p.getHourlyRate();
        if (rate != null) {
            Double rateMin = toDouble(prefMap.get("rate_min"));
            Double rateMax = toDouble(prefMap.get("rate_max"));
            double rateD = rate.doubleValue();
            boolean inMin = rateMin == null || rateD >= rateMin;
            boolean inMax = rateMax == null || rateD <= rateMax;
            if ((rateMin != null || rateMax != null) && inMin && inMax) {
                score += 15;
                signals.put("salary_in_range", "+15");
            }
        }

        // 课表冲突 — position.time_slots 与 course_schedule 同日有重叠时 -30
        if (hasScheduleConflict(p.getTimeSlots(), courseSchedule)) {
            score -= 30;
            signals.put("schedule_conflict", "-30");
        }

        if (score < 0) score = 0;
        if (score > 100) score = 100;
        r.setScore(score);
        return r;
    }

    private boolean hasScheduleConflict(String timeSlotsJson, Map<String, List<String>> courseSchedule) {
        if (timeSlotsJson == null || timeSlotsJson.isBlank() || courseSchedule == null || courseSchedule.isEmpty()) {
            return false;
        }
        try {
            List<Map<String, Object>> slots = objectMapper.readValue(
                    timeSlotsJson, objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class));
            for (Map<String, Object> slot : slots) {
                String day = (String) slot.get("day");
                String start = (String) slot.get("start");
                String end = (String) slot.get("end");
                if (day == null || start == null || end == null) continue;
                List<String> periods = courseSchedule.get(day);
                if (periods == null || periods.isEmpty()) continue;
                int slotStartH = parseHour(start);
                int slotEndH = parseHour(end);
                for (String period : periods) {
                    int[] range = PERIOD_HOURS.get(period);
                    if (range == null) continue;
                    if (overlaps(slotStartH, slotEndH, range[0], range[1])) return true;
                }
            }
        } catch (Exception e) {
            log.debug("schedule conflict check failed (treated as no-conflict): {}", e.getMessage());
        }
        return false;
    }

    private static boolean overlaps(int aStart, int aEnd, int bStart, int bEnd) {
        return aStart < bEnd && bStart < aEnd;
    }

    private static int parseHour(String hhmm) {
        String[] parts = hhmm.split(":");
        return Integer.parseInt(parts[0]);
    }

    private static Double toDouble(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return null; }
    }

    private Map<String, Object> parseJson(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (JsonProcessingException e) {
            return new HashMap<>();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<String>> parseSchedule(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (JsonProcessingException e) {
            return new HashMap<>();
        }
    }
}
