import { useState, useEffect } from 'react';
import { Tag, Button, Segmented, Spin } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import type { CheckinActivity } from '@/api/checkin';
import { getMyActivities } from '@/api/checkin';
import { useAIActionStore } from '@/stores/ai-action.store';
import CreateActivityModal from './CreateActivityModal';
import ActivityDetailDrawer from './ActivityDetailDrawer';
import styles from './index.module.css';

type TabKey = 'active' | 'closed';

const MODE_LABEL: Record<string, string> = {
  qr_scan: '二维码',
  roll_call: '点名',
};

const MODE_COLOR: Record<string, string> = {
  qr_scan: 'var(--ac)',
  roll_call: 'var(--ok)',
};

export default function CheckinManagement() {
  const [tab, setTab] = useState<TabKey>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailActivity, setDetailActivity] = useState<CheckinActivity | null>(null);

  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);

  useEffect(() => {
    if (aiAction?.type === 'open_checkin_form') {
      setCreateOpen(true);
      consumeAction();
    }
  }, [aiAction, consumeAction]);

  const queryParams = {
    page: 1,
    size: 50,
    status: tab,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['checkinActivities', queryParams],
    queryFn: () => getMyActivities(queryParams),
  });

  const handleTabChange = (val: string | number) => {
    setTab(val as TabKey);
  };

  const activities = data?.data ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>签到管理</h1>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          创建签到
        </Button>
      </div>

      <Segmented
        className={styles.segmented}
        options={[
          { label: '进行中', value: 'active' },
          { label: '已结束', value: 'closed' },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      {isFetching ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (
        <div className={styles.cardList}>
          {activities.map((activity) => {
            const modeColor = MODE_COLOR[activity.checkin_mode] ?? '#6b7280';
            const modeLabel = MODE_LABEL[activity.checkin_mode] ?? activity.checkin_mode;
            const statusColor = activity.status === 'active' ? 'var(--ok)' : 'var(--fg-4)';
            const statusLabel = activity.status === 'active' ? '进行中' : '已结束';

            return (
              <div
                key={activity.id}
                className={styles.card}
                onClick={() => setDetailActivity(activity)}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{activity.title}</span>
                  <Tag
                    className={styles.statusTag}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                      color: statusColor,
                      border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
                    }}
                  >
                    {statusLabel}
                  </Tag>
                </div>

                <div className={styles.cardMeta}>
                  <Tag
                    style={{
                      backgroundColor: `color-mix(in srgb, ${modeColor} 10%, transparent)`,
                      color: modeColor,
                      border: `1px solid color-mix(in srgb, ${modeColor} 25%, transparent)`,
                      fontSize: 11,
                      borderRadius: 4,
                      marginRight: 8,
                    }}
                  >
                    {modeLabel}
                  </Tag>
                  {dayjs(activity.start_time).format('MM-DD HH:mm')}
                  {' → '}
                  {dayjs(activity.end_time).format('HH:mm')}
                </div>

                <div className={styles.cardFooter}>
                  <div>
                    <span className={styles.countBadge}>{activity.expected_count}</span>
                    <span className={styles.countLabel}>人应到</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                    迟到阈值 {activity.late_threshold_minutes} 分钟
                  </span>
                </div>
              </div>
            );
          })}

          {activities.length === 0 && (
            <div className={styles.empty} style={{ gridColumn: '1 / -1' }}>
              <InboxOutlined className={styles.emptyIcon} />
              暂无签到活动
            </div>
          )}
        </div>
      )}

      <CreateActivityModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ActivityDetailDrawer
        activity={detailActivity}
        onClose={() => setDetailActivity(null)}
      />
    </div>
  );
}
