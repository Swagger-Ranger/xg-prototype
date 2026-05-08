import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { LeaveRequest, LeaveStatus } from '@xg1/shared';
import {
  getMySchedule,
  listEvents,
  type ClassScheduleEntry,
  type CurrentTermView,
} from '@/api/academic';
import {
  getPosition,
  type TimeSlot,
  type WorkStudyApplication,
} from '@/api/workStudy';
import styles from './WeekAgenda.module.css';

interface Props {
  leaves: LeaveRequest[];
  term: CurrentTermView | null | undefined;
  /** The student's currently-hired work-study application (if any). */
  activeApp: WorkStudyApplication | undefined;
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_KEYS: TimeSlot['day'][] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const COUNTABLE_LEAVE: ReadonlySet<LeaveStatus> = new Set<LeaveStatus>([
  'pending',
  'approved',
  'cancel_pending',
  'cancelled',
]);

type AgendaItem =
  | { kind: 'class'; sortKey: number; entry: ClassScheduleEntry }
  | { kind: 'workstudy'; sortKey: number; slot: TimeSlot; positionTitle: string; location: string }
  | { kind: 'leave'; leave: LeaveRequest }
  | { kind: 'holiday'; name: string };

/** Convert dayjs day() (0=Sun..6=Sat) to ISO Monday-first index 1..7. */
function isoDow(d: dayjs.Dayjs): number {
  const v = d.day();
  return v === 0 ? 7 : v;
}

/** Parse the position's time_slots field — backend sometimes stores as JSON string. */
function parseSlots(raw: TimeSlot[] | string | null | undefined): TimeSlot[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TimeSlot[]) : [];
  } catch {
    return [];
  }
}

/** "08:30" → 830 (minutes-of-day comparable). */
function timeKey(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * "本周日程" — vertical 7-day agenda. Each row aggregates classes from the
 * caller's class schedule (filtered by week) + work-study shifts from the
 * hired position's time_slots + holiday/leave banners. Today's row is tinted
 * to anchor the eye.
 *
 * No item-level click handlers: this is a read-only summary; deep-linking
 * lives in the cards below.
 */
export default function WeekAgenda({ leaves, term, activeApp }: Props) {
  const { data: schedule } = useQuery({
    queryKey: ['mySchedule', term?.code],
    queryFn: () => getMySchedule(term!.code),
    enabled: !!term?.code,
    staleTime: 5 * 60 * 1000,
  });

  const { data: position } = useQuery({
    queryKey: ['workStudyPosition', activeApp?.position_id],
    queryFn: () => getPosition(activeApp!.position_id),
    enabled: !!activeApp?.position_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['academicEvents', 'all'],
    queryFn: () => listEvents(),
    staleTime: 10 * 60 * 1000,
  });

  const today = dayjs();
  const monday = useMemo(() => {
    const offset = today.day() === 0 ? -6 : 1 - today.day();
    return today.add(offset, 'day').startOf('day');
  }, [today]);

  const currentWeek = term?.current_week ?? 0;

  const slotsByDay = useMemo(() => {
    const slots = parseSlots(position?.time_slots);
    const byDay = new Map<TimeSlot['day'], TimeSlot[]>();
    for (const s of slots) {
      const arr = byDay.get(s.day) ?? [];
      arr.push(s);
      byDay.set(s.day, arr);
    }
    return byDay;
  }, [position]);

  const days = useMemo(() => {
    const out: { date: dayjs.Dayjs; isToday: boolean; items: AgendaItem[] }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = monday.add(i, 'day');
      const dow = isoDow(d);
      const dayKey = DAY_KEYS[dow - 1];
      const items: AgendaItem[] = [];

      // 1) holidays — full-day banner
      for (const e of events) {
        if (e.event_type !== 'holiday') continue;
        const start = dayjs(e.start_date);
        const end = dayjs(e.end_date);
        if (!d.isBefore(start, 'day') && !d.isAfter(end, 'day')) {
          items.push({ kind: 'holiday', name: e.name });
          break;       // one banner per day is enough
        }
      }

      // 2) leave — full-day banner (skip if the day is already a holiday since
      //    a holiday-day "请假" is meaningless)
      const hasHoliday = items.some((it) => it.kind === 'holiday');
      if (!hasHoliday) {
        const cover = leaves.find(
          (l) =>
            COUNTABLE_LEAVE.has(l.status)
            && !d.isBefore(dayjs(l.start_time), 'day')
            && !d.isAfter(dayjs(l.end_time), 'day'),
        );
        if (cover) items.push({ kind: 'leave', leave: cover });
      }

      // 3) classes — only if no leave / holiday cancels them. We still show
      //    the banner cases above without the schedule rows so the day reads
      //    cleanly as "off".
      const dayOff = items.some((it) => it.kind === 'leave' || it.kind === 'holiday');
      if (!dayOff && schedule?.entries && currentWeek > 0) {
        for (const e of schedule.entries) {
          if (e.day_of_week !== dow) continue;
          if (!(e.weeks?.includes?.(currentWeek))) continue;
          items.push({ kind: 'class', sortKey: e.start_period, entry: e });
        }
      }

      // 4) work-study shifts — show even on holidays/leave? Probably no; if
      //    you're on leave you're not on duty. Keep gated by !dayOff for now.
      if (!dayOff) {
        const slots = slotsByDay.get(dayKey) ?? [];
        for (const s of slots) {
          items.push({
            kind: 'workstudy',
            sortKey: 1000 + timeKey(s.start),    // sort after classes
            slot: s,
            positionTitle: position?.title ?? '勤工岗位',
            location: position?.work_location ?? position?.department_name ?? '—',
          });
        }
      }

      // Sort: banners (holiday/leave) keep insertion order at top; class +
      // workstudy items by sortKey ascending.
      items.sort((a, b) => {
        const aw = bannerWeight(a);
        const bw = bannerWeight(b);
        if (aw !== bw) return aw - bw;
        const ak = 'sortKey' in a ? a.sortKey : 0;
        const bk = 'sortKey' in b ? b.sortKey : 0;
        return ak - bk;
      });

      out.push({ date: d, isToday: d.isSame(today, 'day'), items });
    }
    return out;
  }, [monday, today, events, leaves, schedule, currentWeek, slotsByDay, position]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>本周日程</span>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotClass}`} />课程
          </span>
          {position && (
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.dotWorkstudy}`} />勤工
            </span>
          )}
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotLeave}`} />请假
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotHoliday}`} />假期
          </span>
        </div>
      </div>

      {days.map((day, i) => (
        <div key={i} className={`${styles.row} ${day.isToday ? styles.today : ''}`}>
          <div>
            <div className={`${styles.dayLabel} ${day.isToday ? styles.todayLabel : ''}`}>
              {DAY_LABELS[i]}
            </div>
            <div className={styles.dayDate}>{day.date.format('MM-DD')}</div>
            {day.isToday && <div className={styles.todayBadge}>今天</div>}
          </div>
          <div className={styles.items}>
            {day.items.length === 0 ? (
              <div className={styles.empty}>无安排</div>
            ) : (
              day.items.map((it, j) => <AgendaItemRow key={j} item={it} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function bannerWeight(item: AgendaItem): number {
  if (item.kind === 'holiday') return 0;
  if (item.kind === 'leave') return 1;
  return 2;
}

function AgendaItemRow({ item }: { item: AgendaItem }) {
  if (item.kind === 'holiday') {
    return <span className={`${styles.banner} ${styles.bannerHoliday}`}>{item.name}</span>;
  }
  if (item.kind === 'leave') {
    const days = item.leave.duration_days;
    return (
      <span className={`${styles.banner} ${styles.bannerLeave}`}>
        请假 · {item.leave.leave_type_name}
        {days ? ` · ${days}天` : ''}
      </span>
    );
  }
  if (item.kind === 'class') {
    const e = item.entry;
    const period = e.start_period === e.end_period
      ? `第${e.start_period}节`
      : `第${e.start_period}-${e.end_period}节`;
    return (
      <div className={styles.item}>
        <span className={`${styles.itemDot} ${styles.dotClass}`} />
        <div className={styles.itemBody}>
          <span className={styles.itemTime}>{period}</span>
          <span className={styles.itemTitle}>{e.course_name}</span>
          <span className={styles.itemMeta}>
            {e.location}
            {e.teacher ? ` · ${e.teacher}` : ''}
          </span>
        </div>
      </div>
    );
  }
  // workstudy
  return (
    <div className={styles.item}>
      <span className={`${styles.itemDot} ${styles.dotWorkstudy}`} />
      <div className={styles.itemBody}>
        <span className={styles.itemTime}>
          {item.slot.start}–{item.slot.end}
        </span>
        <span className={styles.itemTitle}>{item.positionTitle}</span>
        <span className={styles.itemMeta}>{item.location}</span>
      </div>
    </div>
  );
}
