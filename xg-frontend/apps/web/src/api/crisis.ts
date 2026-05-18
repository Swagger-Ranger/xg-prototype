import api from './index';
import type { CareBrief } from './care';

/**
 * 危机求助快速通道 —— 工作台读视图 + 关闭（设计 §4/§5，PRD §9.5）。
 *
 * 后端全局 Jackson SNAKE_CASE，字段名用下划线，与 care.ts 一致。
 * 越权过滤在服务端（辅导员只见名下学生），前端不传 scope。
 */

/** 「危机·需立即人工核实」泳道列表项（区一摘要，纯 DB）。 */
export interface CrisisSignalListItem {
  signal_id: number;
  student_id: number;
  student_name: string | null;
  class_name: string | null;
  created_at: string;
  status: string;
  notify_status: string | null;
}

/** 区二·近期关怀任务（纯 DB）。 */
export interface CrisisRecentCare {
  severity: string | null;
  status: string | null;
  closed_reason: string | null;
  created_at: string | null;
}

/** 区二·近期请假（纯 DB）。 */
export interface CrisisRecentLeave {
  leave_type_name: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  reason: string | null;
  created_at: string | null;
}

/** 区二·近期违纪 + 关联处分（纯 DB）。 */
export interface CrisisRecentViolation {
  category: string | null;
  occurred_at: string | null;
  description: string | null;
  approval_status: string | null;
  punishment_level: string | null;
  punishment_status: string | null;
}

/**
 * 危机详情。区一（处理必须，纯 DB，永远渲染）+ 区二（辅助判断，可降级）。
 * brief 为关怀侧已算结果的复用，缺失为 null → 前端降级「暂无可用画像」，
 * 不影响区一与区二其余纯 DB 内容。
 */
export interface CrisisSignalDetail {
  // 区一
  signal_id: number;
  student_id: number;
  student_name: string | null;
  class_name: string | null;
  grade: string | null;
  student_no: string | null;
  phone: string | null;
  created_at: string;
  rule_version: string | null;
  /** 命中类别 safety/basic_needs；区一据此显示「为什么触发」分诊层（非原话，§5）。 */
  category: string | null;
  status: string;
  notify_status: string | null;
  handled_at: string | null;
  handled_by: number | null;
  // 区二
  care_history_count: number;
  recent_care: CrisisRecentCare[];
  recent_leave: CrisisRecentLeave[];
  recent_violation: CrisisRecentViolation[];
  brief: CareBrief | null;
}

export function listCrisisSignals(): Promise<CrisisSignalListItem[]> {
  return api.get('/crisis-signal').then((res) => res.data);
}

export function getCrisisSignal(id: number | string): Promise<CrisisSignalDetail> {
  return api.get(`/crisis-signal/${id}`).then((res) => res.data);
}

export function closeCrisisSignal(id: number | string): Promise<void> {
  return api.post(`/crisis-signal/${id}/close`).then((res) => res.data);
}
