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

/**
 * 首页「今日简报」教职工口径的关怀摘要，取代旧 getAlertSummary（student_alert 下线）。
 * 形状与旧 AlertSummary 兼容，调用方无需改逻辑。后端 List 参数按逗号绑定；
 * assigneeScope:'all' 对管理角色返回本校全部、对辅导员后端强制收窄为本人。
 */
export interface CareSummary {
  open_total: string;
  by_severity: Partial<Record<'critical' | 'high' | 'medium' | 'low', string>>;
}

const CARE_OPEN_STATUSES = 'pending,accepted,in_progress,overdue';

export async function getCareSummary(): Promise<CareSummary> {
  const [all, criticalHigh] = await Promise.all([
    get<{ total?: number }>('/care/tasks', {
      statuses: CARE_OPEN_STATUSES,
      assigneeScope: 'all',
      size: 1,
    }),
    get<{ total?: number }>('/care/tasks', {
      statuses: CARE_OPEN_STATUSES,
      severities: 'critical,high',
      assigneeScope: 'all',
      size: 1,
    }),
  ]);
  return {
    open_total: String(all.total ?? 0),
    // 调用方按 critical+high 求和；合计塞 critical、high 置 0，求和不变。
    by_severity: { critical: String(criticalHigh.total ?? 0), high: '0' },
  };
}
