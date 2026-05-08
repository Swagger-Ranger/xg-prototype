package com.xg.business.student.dto;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * Aggregated AI insight payload for student profile page.
 * Peer stats compare the student against classmates over the last 90 days;
 * trend reports 6 monthly buckets of events / alerts / talks.
 */
@Getter
@Setter
@Builder
public class StudentInsightResponse {

    private PeerBlock peer;
    private List<TrendPoint> trend;

    @Getter
    @Setter
    @Builder
    public static class PeerBlock {
        private String scope;       // e.g. "软件工程 2101 班"
        private Integer peerCount;  // classmates excluding self
        private MetricSet self;
        private MetricSet classAvg;
        private MetricSet classMax;
        private MetricSet percentile; // 0-100, higher = worse
    }

    @Getter
    @Setter
    @Builder
    public static class MetricSet {
        private double violations;
        private double openAlerts;
        private double leaveDays;
        private double lateAbsent;
        private double talks;
    }

    @Getter
    @Setter
    @Builder
    public static class TrendPoint {
        private String month;        // "2025-11"
        private int highEvents;      // severity >= 6
        private int midLowEvents;    // severity 1..5
        private int alerts;
        private int talks;
    }
}
