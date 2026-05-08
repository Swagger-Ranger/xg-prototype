import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { LeaveRequest, LeaveStatus } from '@xg1/shared';
import type { CurrentTermView } from '@/api/academic';
import styles from './LeaveHeatmap.module.css';

interface Props {
  leaves: LeaveRequest[];
  /** When provided, the heatmap renders [term.start_date, term.end_date]; otherwise it falls back to the current calendar year. */
  term?: CurrentTermView | null;
}

const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日'];   // Mon, Wed, Fri, Sun
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// Heatmap is "实际请过/将请的" — drafts haven't been submitted and rejected
// requests never happen, so they shouldn't tint the calendar.
const COUNTABLE: ReadonlySet<LeaveStatus> = new Set<LeaveStatus>([
  'pending',
  'approved',
  'cancel_pending',
  'cancelled',
]);

function levelClass(count: number): string {
  if (count <= 0) return styles.lvl0;
  if (count === 1) return styles.lvl1;
  if (count <= 3) return styles.lvl2;
  return styles.lvl3;
}

/**
 * GitHub-style heatmap of the student's leave days. Defaults to the current
 * term range so it matches the rest of the dashboard; falls back to the
 * calendar year when no term is configured.
 *
 * Cells are read-only (no click handler); rejected/draft leaves are excluded.
 */
export default function LeaveHeatmap({ leaves, term }: Props) {
  const countableLeaves = useMemo(
    () => leaves.filter((l) => COUNTABLE.has(l.status)),
    [leaves],
  );

  // Range — term-scoped if we have one, else calendar year. Both cases
  // produce a [from, to] inclusive day range.
  const [from, to, title] = useMemo(() => {
    if (term?.start_date && term?.end_date) {
      return [
        dayjs(term.start_date),
        dayjs(term.end_date),
        `${term.name ?? term.code} 请假分布`,
      ] as const;
    }
    const y = dayjs().year();
    return [
      dayjs(`${y}-01-01`),
      dayjs(`${y}-12-31`),
      `${y} 年请假分布`,
    ] as const;
  }, [term]);

  const dayCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of countableLeaves) {
      const start = dayjs(l.start_time);
      const end = dayjs(l.end_time);
      let d = start.isBefore(from, 'day') ? from : start;
      while (!d.isAfter(end, 'day') && !d.isAfter(to, 'day')) {
        const k = d.format('YYYY-MM-DD');
        map.set(k, (map.get(k) ?? 0) + 1);
        d = d.add(1, 'day');
      }
    }
    return map;
  }, [countableLeaves, from, to]);

  // Build a Mon-aligned grid covering [from, to]. First column is the Monday
  // on or before `from`; last column extends through the Sunday on or after
  // `to` so the trailing week stays visually full.
  const cells = useMemo(() => {
    const out: { date: dayjs.Dayjs; inRange: boolean; count: number }[] = [];
    const monIndex = (from.day() + 6) % 7;          // 0=Mon..6=Sun
    let d = from.subtract(monIndex, 'day');

    // safety cap — long-tail terms shouldn't blow up
    const HARD_CAP = 7 * 60;
    let i = 0;
    while (i < HARD_CAP) {
      const inRange = !d.isBefore(from, 'day') && !d.isAfter(to, 'day');
      const count = inRange ? (dayCount.get(d.format('YYYY-MM-DD')) ?? 0) : 0;
      out.push({ date: d, inRange, count });
      d = d.add(1, 'day');
      i++;
      // stop once we're past `to` and aligned to Sunday end (i.e. next is Mon)
      if (d.isAfter(to, 'day') && ((d.day() + 6) % 7) === 0) break;
    }
    return out;
  }, [from, to, dayCount]);

  const totalDays = useMemo(() => {
    let total = 0;
    for (const cell of cells) {
      if (cell.inRange && cell.count > 0) total++;
    }
    return total;
  }, [cells]);

  // Total leaves whose date overlaps the range — single source of truth so
  // header "次" never disagrees with what's painted on the grid.
  const totalLeaves = useMemo(
    () =>
      countableLeaves.filter((l) => {
        const s = dayjs(l.start_time);
        const e = dayjs(l.end_time);
        return !e.isBefore(from, 'day') && !s.isAfter(to, 'day');
      }).length,
    [countableLeaves, from, to],
  );

  // Month label = column where the month first appears among in-range cells.
  const colWidth = 13;  // 11px cell + 2px gap
  const monthCols: { month: number; col: number }[] = [];
  let lastMonth = -1;
  cells.forEach((c, idx) => {
    if (!c.inRange) return;
    const m = c.date.month();
    if (m !== lastMonth) {
      monthCols.push({ month: m, col: Math.floor(idx / 7) });
      lastMonth = m;
    }
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>
          累计 {totalDays} 天 / {totalLeaves} 次
        </span>
      </div>
      <div className={styles.scrollContainer}>
        <div className={styles.grid}>
          <div className={styles.monthLabels}>
            {monthCols.map((m) => (
              <span
                key={`${m.month}-${m.col}`}
                className={styles.monthLabel}
                style={{ left: m.col * colWidth }}
              >
                {MONTH_LABELS[m.month]}
              </span>
            ))}
          </div>
          <div className={styles.weekdayLabels}>
            {WEEKDAY_LABELS.map((l, i) => (
              <span key={i} className={styles.weekdayLabel}>{l}</span>
            ))}
          </div>
          <div className={styles.cells}>
            {cells.map((c, i) => (
              <span
                key={i}
                className={`${styles.cell} ${c.inRange ? levelClass(c.count) : styles.empty}`}
                title={c.inRange
                  ? `${c.date.format('YYYY-MM-DD')} · ${c.count > 0 ? '在请假' : '无请假'}`
                  : ''
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendLabel}>少</span>
        <span className={`${styles.legendCell} ${styles.lvl0}`} />
        <span className={`${styles.legendCell} ${styles.lvl1}`} />
        <span className={`${styles.legendCell} ${styles.lvl2}`} />
        <span className={`${styles.legendCell} ${styles.lvl3}`} />
        <span className={styles.legendLabel}>多</span>
      </div>
    </div>
  );
}
