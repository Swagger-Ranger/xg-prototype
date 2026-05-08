/**
 * Home page metrics aggregator.
 *
 * Fans out 4 parallel requests on home page mount and returns aggregated
 * counts. Each call falls back to 0 on failure — the home grid renders
 * gracefully whether or not every backend module is up.
 */
import { get } from '../utils/request';

interface PageResult<T> {
  data: T[];
  total: number | string;
}

interface LeaveRow {
  id: string;
  status: string;
}

interface ApplicationRow {
  id: string;
  status: string;
}

interface SalaryRow {
  id: string;
  amount: string;
  month: string;
  status: string;
}

export interface HomeMetrics {
  pendingLeaveCount: number;
  unreadCount: number;
  pendingAppCount: number;
  monthSalary: number;
  /** YYYY-MM used for salary filter */
  month: string;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Pulls 4 stats in parallel. Errors per call resolve to safe defaults so
 * that one missing endpoint doesn't blank out the whole home page.
 */
export async function getHomeMetrics(): Promise<HomeMetrics> {
  const month = currentMonth();

  const safeGet = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise;
    } catch {
      return fallback;
    }
  };

  const [leaves, unread, apps, salaries] = await Promise.all([
    safeGet<PageResult<LeaveRow>>(
      get<PageResult<LeaveRow>>('/leaves/my', { page: 1, size: 100 }),
      { data: [], total: 0 },
    ),
    safeGet<number>(
      get<number>('/notifications/unread-count'),
      0,
    ),
    safeGet<PageResult<ApplicationRow>>(
      get<PageResult<ApplicationRow>>('/work-study/applications', { page: 1, size: 100 }),
      { data: [], total: 0 },
    ),
    safeGet<PageResult<SalaryRow>>(
      get<PageResult<SalaryRow>>('/work-study/salaries', { page: 1, size: 100, month }),
      { data: [], total: 0 },
    ),
  ]);

  // Pending leave count = status pending|cancel_pending
  const pendingLeaveCount = (leaves.data ?? []).filter(
    (l) => l.status === 'pending' || l.status === 'cancel_pending',
  ).length;

  // Pending app count = pending|recommended (recommended is a legacy "in flight" state)
  const pendingAppCount = (apps.data ?? []).filter(
    (a) => a.status === 'pending' || a.status === 'recommended',
  ).length;

  // Salary sum — only confirmed/paid count toward "本月薪资" (pending/draft are not yet earned).
  const monthSalary = (salaries.data ?? [])
    .filter((s) => s.status === 'confirmed' || s.status === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  return {
    pendingLeaveCount,
    unreadCount: Number(unread) || 0,
    pendingAppCount,
    monthSalary,
    month,
  };
}
