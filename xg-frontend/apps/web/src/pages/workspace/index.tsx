import { useNavigate } from 'react-router-dom';
import { Tag, Spin } from 'antd';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from '@xg1/shared';
import { getUnreadCount } from '@/api/notification';
import { getPendingTasks } from '@/api/workflow';
import { getClassLeaves, getMyLeaves } from '@/api/leave';
import { useAuth } from '@/hooks/useAuth';
import styles from './index.module.css';

export default function Workspace() {
  const navigate = useNavigate();
  const { user, isStudent } = useAuth();

  const { data: pendingTasks } = useQuery({
    queryKey: ['pendingTasks', { page: 1, size: 5, assigneeId: user?.id }],
    queryFn: () => getPendingTasks({ page: 1, size: 5, assigneeId: user?.id }),
    enabled: !isStudent,
  });

  const { data: classLeaves } = useQuery({
    queryKey: ['classLeaves', { page: 1, size: 20, status: 'pending' }],
    queryFn: () => getClassLeaves({ page: 1, size: 20, status: 'pending' }),
    enabled: !isStudent,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const { data: recentLeaves } = useQuery({
    queryKey: ['classLeaves', { page: 1, size: 5 }],
    queryFn: () => getClassLeaves({ page: 1, size: 5 }),
    enabled: !isStudent,
  });

  const { data: myLeaves } = useQuery({
    queryKey: ['myLeaves', { page: 1, size: 5 }],
    queryFn: () => getMyLeaves({ page: 1, size: 5 }),
    enabled: isStudent,
  });

  const today = dayjs().format('YYYY-MM-DD');
  const todayLeaveCount =
    classLeaves?.data.filter((l) => dayjs(l.start_time).format('YYYY-MM-DD') === today).length ?? 0;

  const counselorStatCards = [
    { label: '待审批', value: pendingTasks?.total ?? 0, color: 'var(--ac)', href: '/leave' },
    { label: '今日请假', value: todayLeaveCount, color: 'var(--cy)', href: '/leave' },
    { label: '未读通知', value: unreadCount, color: 'var(--warn)', href: '/notification' },
    { label: '在校学生', value: '—', color: 'var(--ok)', href: '/student' }, // TODO: 接入学生统计 API
  ];

  const studentStatCards = [
    { label: '我的请假', value: myLeaves?.total ?? 0, color: 'var(--ac)', href: '/leave' },
    { label: '未读通知', value: unreadCount, color: 'var(--warn)', href: '/notification' },
  ];

  const statCards = isStudent ? studentStatCards : counselorStatCards;

  return (
    <div className={styles.workspace}>
      {user?.real_name && (
        <div className={styles.greeting}>你好，{user.real_name}</div>
      )}

      <div className={styles.sectionLabel}>
        <span>数据概览</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.statGrid}>
        {statCards.map((card) => (
          <div
            key={card.label}
            className={styles.statCard}
            style={{ '--accent': card.color } as React.CSSProperties}
            onClick={() => card.href && navigate(card.href)}
          >
            <div className={styles.statAccent} />
            <div className={styles.statValue}>{card.value}</div>
            <div className={styles.statLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.contentGrid}>
        {/* 待办事项 — counselor/admin only */}
        {!isStudent && (
          <div>
            <div className={styles.sectionLabel}>
              <span>待办事项</span>
              <div className={styles.sectionLine} />
            </div>
            <div className={styles.todoList}>
              {!pendingTasks ? (
                <div className={styles.todoEmpty}><Spin size="small" /></div>
              ) : pendingTasks.data.length === 0 ? (
                <div className={styles.todoEmpty}>暂无待办事项</div>
              ) : (
                pendingTasks.data.map((task) => (
                  <div key={task.id} className={styles.tableRow} onClick={() => navigate('/leave')}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{task.node_name}</div>
                      <div className={styles.rowSub}>{task.assignee_name}</div>
                    </div>
                    <div className={styles.rowMeta}>{dayjs(task.created_at).format('MM-DD HH:mm')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 最近请假 (counselor) / 我的请假记录 (student) */}
        <div>
          <div className={styles.sectionLabel}>
            <span>{isStudent ? '我的请假记录' : '最近请假'}</span>
            <div className={styles.sectionLine} />
          </div>
          <div className={styles.todoList}>
            {isStudent ? (
              !myLeaves ? (
                <div className={styles.todoEmpty}><Spin size="small" /></div>
              ) : myLeaves.data.length === 0 ? (
                <div className={styles.todoEmpty}>暂无请假记录</div>
              ) : (
                myLeaves.data.map((leave) => (
                  <div key={leave.id} className={styles.tableRow} onClick={() => navigate('/leave')}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{leave.leave_type_name} · {leave.duration_days}天</div>
                      <div className={styles.rowSub}>{dayjs(leave.start_time).format('YYYY-MM-DD')}</div>
                    </div>
                    <div className={styles.rowMeta}>
                      <Tag color={LEAVE_STATUS_COLORS[leave.status]} style={{ margin: 0, fontSize: 11 }}>
                        {LEAVE_STATUS_LABELS[leave.status]}
                      </Tag>
                    </div>
                  </div>
                ))
              )
            ) : (
              !recentLeaves ? (
                <div className={styles.todoEmpty}><Spin size="small" /></div>
              ) : recentLeaves.data.length === 0 ? (
                <div className={styles.todoEmpty}>暂无请假记录</div>
              ) : (
                recentLeaves.data.map((leave) => (
                  <div key={leave.id} className={styles.tableRow} onClick={() => navigate('/leave')}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{leave.student_name}</div>
                      <div className={styles.rowSub}>{leave.leave_type_name} · {leave.duration_days}天</div>
                    </div>
                    <div className={styles.rowMeta}>
                      <Tag color={LEAVE_STATUS_COLORS[leave.status]} style={{ margin: 0, fontSize: 11 }}>
                        {LEAVE_STATUS_LABELS[leave.status]}
                      </Tag>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
