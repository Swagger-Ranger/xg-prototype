import api from './index';

export interface MetricSet {
  violations: number;
  open_alerts: number;
  leave_days: number;
  late_absent: number;
  talks: number;
}

export interface PeerBlock {
  scope: string;
  peer_count: number;
  self: MetricSet;
  class_avg: MetricSet;
  class_max: MetricSet;
  percentile: MetricSet;
}

export interface TrendPoint {
  month: string;
  high_events: number;
  mid_low_events: number;
  alerts: number;
  talks: number;
}

export interface StudentInsight {
  peer: PeerBlock;
  trend: TrendPoint[];
}

export function getStudentInsight(id: string): Promise<StudentInsight> {
  return api.get(`/students/${id}/insight`).then((res) => res.data);
}
