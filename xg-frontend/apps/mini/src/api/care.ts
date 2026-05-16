/**
 * 学生侧只读关怀摘要（PRD §13.3）。仅"知情权兜底"——
 * 不主推、不弹窗、不通知，只在"我的 → 个人信息保护"里能查到。
 * 后端强制 student_id = 当前登录用户，无 studentId 入参。
 */
import { get } from '../utils/request';

export interface CareActiveSummaryItem {
  /** 学业 / 行为 / 生活 / 勤工助学 */
  category: string;
  count: number;
  /** 后端已渲染好的整句文案，前端原样展示，不再二次拼接 */
  message: string;
}

export interface CareActiveSummary {
  items: CareActiveSummaryItem[];
  /** 全部关闭时后端给的兜底文案；有 items 时缺省 */
  message?: string;
}

export function getCareActiveSummary() {
  return get<CareActiveSummary>('/care/me/active-summary');
}
