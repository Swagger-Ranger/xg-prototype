import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

/**
 * SLA 实时倒计时（W1 §2.3：due_at - now，前端算，单位自动 h / d）。
 * 每分钟刷新；已超期显示红色"已超期 Xh"。
 */
export function SlaCountdown({ dueAt }: { dueAt: string }) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(t);
  }, []);

  const due = dayjs(dueAt);
  const diffMin = due.diff(now, 'minute');
  const overdue = diffMin < 0;
  const absMin = Math.abs(diffMin);
  const text =
    absMin >= 48 * 60
      ? `${Math.round(absMin / (24 * 60))}d`
      : absMin >= 60
        ? `${Math.round(absMin / 60)}h`
        : `${absMin}m`;

  return (
    <span style={{ color: overdue ? 'var(--ant-color-error, #dc2626)' : undefined }}>
      {overdue ? `已超期 ${text}` : `SLA 还剩 ${text}`}
    </span>
  );
}
