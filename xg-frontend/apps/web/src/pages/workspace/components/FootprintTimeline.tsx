import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { LeaveRequest } from '@xg1/shared';
import type { WorkStudyApplication } from '@/api/workStudy';
import type { CurrentTermView } from '@/api/academic';
import styles from './FootprintTimeline.module.css';

interface Props {
  leaves: LeaveRequest[];
  apps: WorkStudyApplication[];
  term: CurrentTermView | null | undefined;
}

type Footprint = {
  id: string;
  date: string;          // YYYY-MM-DD for grouping/sort
  ts: number;            // millis for sort
  type: 'leave' | 'workstudy';
  status: string;
  title: React.ReactNode;
  subtitle?: string;
  onClick: () => void;
};

const LEAVE_STATUS_TEXT: Record<string, string> = {
  approved: '已通过',
  rejected: '已驳回',
  pending: '审批中',
  cancel_pending: '销假中',
  cancelled: '已销假',
};

const APP_STATUS_TEXT: Record<string, string> = {
  pending: '审核中',
  recommended: '已推荐',
  hired: '已录用',
  rejected: '未通过',
};

/**
 * Vertical footprint timeline of the student's term activity. Items come
 * exclusively from data the dashboard already loads ({@link leaves}, {@link
 * apps}) — no extra fetches. Range is [term.start_date, today]; older entries
 * fall off when a new term starts.
 *
 * Tag colour reflects status; dot colour echoes the type so the rail reads
 * scannable even at a glance.
 */
export default function FootprintTimeline({ leaves, apps, term }: Props) {
  const navigate = useNavigate();

  const items = useMemo<Footprint[]>(() => {
    const out: Footprint[] = [];
    const termStart = term?.start_date ? dayjs(term.start_date) : null;
    const today = dayjs().endOf('day');

    const inTerm = (d: dayjs.Dayjs) =>
      (!termStart || !d.isBefore(termStart, 'day')) && !d.isAfter(today, 'day');

    for (const l of leaves) {
      const d = dayjs(l.created_at ?? l.start_time);
      if (!inTerm(d)) continue;
      out.push({
        id: `leave-${l.id}`,
        date: d.format('MM-DD'),
        ts: d.valueOf(),
        type: 'leave',
        status: l.status,
        title: (
          <>
            申请请假 · {l.leave_type_name} <em>{l.duration_days}天</em>
          </>
        ),
        subtitle: `${dayjs(l.start_time).format('MM-DD')}${l.end_time ? ` 至 ${dayjs(l.end_time).format('MM-DD')}` : ''}`,
        onClick: () => navigate('/leave'),
      });
    }

    for (const a of apps) {
      const d = dayjs(a.created_at);
      if (!inTerm(d)) continue;
      out.push({
        id: `app-${a.id}`,
        date: d.format('MM-DD'),
        ts: d.valueOf(),
        type: 'workstudy',
        status: a.status,
        title: <>申请勤工岗位 #{a.position_id}</>,
        subtitle: a.intro?.slice(0, 30) || undefined,
        onClick: () => navigate('/work-study'),
      });
    }

    out.sort((a, b) => b.ts - a.ts);
    return out;
  }, [leaves, apps, term, navigate]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>本学期足迹</span>
        <span className={styles.subtitle}>
          {term?.code ?? ''} · 共 {items.length} 条
        </span>
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>本学期暂无活动记录</div>
      ) : (
        <div className={styles.timeline}>
          {items.map((it) => (
            <div key={it.id} className={styles.row} onClick={it.onClick} style={{ cursor: 'pointer' }}>
              <span className={`${styles.dot} ${dotClass(it)}`} />
              <span className={styles.date}>{it.date}</span>
              <div className={styles.body}>
                <div className={styles.bodyTitle}>
                  {it.title}
                  <span className={`${styles.tag} ${tagClass(it)}`}>
                    {labelFor(it)}
                  </span>
                </div>
                {it.subtitle && <div className={styles.bodySub}>{it.subtitle}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function dotClass(it: Footprint): string {
  if (it.type === 'leave') {
    return it.status === 'rejected' ? styles.dotLeaveRej : styles.dotLeave;
  }
  return it.status === 'hired' ? styles.dotWorkstudyHired : styles.dotWorkstudy;
}

function tagClass(it: Footprint): string {
  if (it.type === 'leave') {
    if (it.status === 'approved' || it.status === 'cancelled') return styles.tagApproved;
    if (it.status === 'rejected') return styles.tagRejected;
    return styles.tagPending;
  }
  if (it.status === 'hired') return styles.tagHired;
  if (it.status === 'rejected') return styles.tagRejected;
  return styles.tagPending;
}

function labelFor(it: Footprint): string {
  return it.type === 'leave'
    ? (LEAVE_STATUS_TEXT[it.status] ?? it.status)
    : (APP_STATUS_TEXT[it.status] ?? it.status);
}
