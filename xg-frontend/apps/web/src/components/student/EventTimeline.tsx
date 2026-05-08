import { useQuery } from '@tanstack/react-query';
import { Empty, Spin, Tag } from 'antd';
import dayjs from 'dayjs';
import { listStudentEvents } from '@/api/studentEvent';
import styles from './EventTimeline.module.css';

const EVENT_LABELS: Record<string, string> = {
  leave_submit: '提交请假',
  leave_rejected: '请假被拒',
  leave_cancelled: '请假销假',
  checkin_success: '签到成功',
  checkin_late: '迟到',
  checkin_absent: '缺勤',
  violation_recorded: '违纪记录',
  notification_confirmed: '通知已确认',
  notification_unconfirmed: '通知未确认',
  collection_filled: '填写采集',
  collection_overdue: '采集逾期',
  counselor_talk_recorded: '辅导谈话',
};

function severityClass(severity: number) {
  if (severity >= 7) return styles.critical;
  if (severity >= 4) return styles.warn;
  if (severity >= 1) return styles.info;
  return styles.ok;
}

interface EventTimelineProps {
  studentId: string | number;
}

export default function EventTimeline({ studentId }: EventTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['studentEvents', String(studentId)],
    queryFn: () => listStudentEvents(studentId, { page: 1, size: 30 }),
  });

  if (isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="small" />
      </div>
    );
  }

  const events = data?.data ?? [];
  if (events.length === 0) {
    return (
      <div className={styles.center}>
        <Empty description="暂无行为记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {events.map((e) => (
        <div key={e.id} className={styles.row}>
          <div className={`${styles.dot} ${severityClass(e.severity)}`} />
          <div className={styles.body}>
            <div className={styles.head}>
              <span className={styles.title}>
                {EVENT_LABELS[e.event_type] ?? e.event_type}
              </span>
              <Tag className={styles.sevTag}>severity {e.severity}</Tag>
              <span className={styles.source}>{e.event_source}</span>
            </div>
            <div className={styles.time}>
              {dayjs(e.occurred_at).format('YYYY-MM-DD HH:mm')}
            </div>
            {e.event_data && Object.keys(e.event_data).length > 0 && (
              <div className={styles.data}>
                {Object.entries(e.event_data).slice(0, 4).map(([k, v]) => (
                  <span key={k} className={styles.kv}>
                    <span className={styles.k}>{k}</span>
                    <span className={styles.v}>{String(v)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
