import { useNavigate } from 'react-router-dom';
import { Spin, Tag } from 'antd';
import {
  BellOutlined,
  FileTextOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import type { LeaveRequest } from '@xg1/shared';
import { LEAVE_STATUS_COLORS, LEAVE_STATUS_LABELS } from '@xg1/shared';
import { getUnreadCount } from '@/api/notification';
import { getMyLeaves } from '@/api/leave';
import { getCurrentTerm } from '@/api/academic';
import { getInstanceTimeline } from '@/api/workflow';
import { listApplications } from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';
import SemesterProgressRing from './components/SemesterProgressRing';
import WeekAgenda from './components/WeekAgenda';
import LeaveHeatmap from './components/LeaveHeatmap';
import FootprintTimeline from './components/FootprintTimeline';
import styles from './index.module.css';

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: '审核中',
  recommended: '已推荐',
  hired: '已录用',
  rejected: '未通过',
};

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  pending: 'processing',
  recommended: 'gold',
  hired: 'success',
  rejected: 'default',
};

/**
 * Per-leave status detail line. Shows:
 *   - "等待 [当前节点名]" while pending in the workflow
 *   - "驳回意见：xxx" when rejected (from the rejected task's comment)
 *   - nothing for approved / cancelled (the status tag already says enough)
 *
 * Each row issues its own timeline query — N+1 in theory, but the dashboard
 * caps at 3 leaves, so 3 parallel cached queries is fine.
 */
function LeaveStatusLine({ leave }: { leave: LeaveRequest }) {
  const needsDetail = leave.status === 'pending' || leave.status === 'cancel_pending' || leave.status === 'rejected';
  const { data: timeline } = useQuery({
    queryKey: ['leaveTimeline', leave.workflow_instance_id],
    queryFn: () => getInstanceTimeline(leave.workflow_instance_id!),
    enabled: needsDetail && !!leave.workflow_instance_id,
    staleTime: 30 * 1000,
  });

  if (!needsDetail) return null;
  if (!leave.workflow_instance_id) return null;
  if (!timeline) {
    return <div className={styles.miniListDetail}>状态加载中…</div>;
  }

  if (leave.status === 'rejected') {
    const rejected = timeline.nodes.find((n) => n.decision === 'rejected');
    const reason = rejected?.comment?.trim();
    return (
      <div className={`${styles.miniListDetail} ${styles.danger}`}>
        驳回意见：{reason || '辅导员未填写原因'}
      </div>
    );
  }

  // pending / cancel_pending — show the in-progress node so the student
  // knows where the approval is stuck.
  const current = timeline.nodes.find((n) => n.state === 'in_progress');
  const nodeName = current?.name ?? '审批节点';
  return (
    <div className={`${styles.miniListDetail} ${styles.warn}`}>
      {leave.status === 'cancel_pending' ? '销假等待 ' : '等待 '}
      <em>{nodeName}</em>
    </div>
  );
}

export default function StudentWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const { data: leavesPage } = useQuery({
    queryKey: ['myLeaves', { page: 1, size: 10 }],
    queryFn: () => getMyLeaves({ page: 1, size: 10 }),
  });
  const leaves = leavesPage?.data ?? [];

  const { data: appsPage } = useQuery({
    queryKey: ['myApplications', user?.id],
    queryFn: () => listApplications({ page: 1, size: 10, student_id: String(user!.id) }),
    enabled: !!user?.id,
  });
  const apps = appsPage?.data ?? [];

  // Current term view drives the progress ring + week timeline + footprint
  // range. Cached under a stable key so future siblings share the result.
  const { data: term } = useQuery({
    queryKey: ['currentTermView'],
    queryFn: getCurrentTerm,
    staleTime: 5 * 60 * 1000,
  });

  const pendingLeaveCount = leaves.filter(
    (l) => l.status === 'pending' || l.status === 'cancel_pending',
  ).length;
  const activeWorkstudy = apps.find((a) => a.status === 'hired');
  const pendingApplications = apps.filter(
    (a) => a.status === 'pending' || a.status === 'recommended',
  ).length;

  // 3 metric stats; the 4th grid slot hosts SemesterProgressRing.
  const stats = [
    {
      label: '审批中',
      value: pendingLeaveCount,
      icon: <FileTextOutlined />,
      onClick: () => navigate('/leave'),
      footer: pendingLeaveCount > 0 ? '请假待审批' : '无进行中',
    },
    {
      label: '勤工',
      value: activeWorkstudy
        ? '在岗'
        : pendingApplications > 0
          ? `${pendingApplications} 申请`
          : '—',
      icon: <ShopOutlined />,
      onClick: () => navigate('/work-study'),
      footer: activeWorkstudy
        ? '已录用'
        : pendingApplications > 0
          ? '审核中'
          : '无',
    },
    {
      label: '未读通知',
      value: unreadCount,
      icon: <BellOutlined />,
      onClick: () => navigate('/notification'),
      footer: unreadCount > 0 ? '待查看' : '已读完',
    },
  ];

  const recentLeaves = leaves.slice(0, 3);
  const recentApps = apps.slice(0, 3);

  return (
    <div className={styles.workspace}>
      <div className={styles.statGrid}>
        {/* Slot 1: 学期进度环 */}
        <div
          className={styles.statCard}
          onClick={() => navigate('/leave')}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <SemesterProgressRing term={term} />
        </div>
        {stats.map((s) => (
          <div key={s.label} className={styles.statCard} onClick={s.onClick}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statIcon}>{s.icon}</span>
            </div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statFooter}>
              <span>{s.footer}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 本周日程：课程 + 勤工排班 */}
      <WeekAgenda leaves={leaves} term={term} activeApp={activeWorkstudy} />

      <div className={styles.studentCardGrid}>
        {/* 我的请假 — every row also surfaces "等待 [节点]" or "驳回意见" */}
        <div className={styles.miniCard}>
          <div className={styles.miniCardHeader}>
            <span className={styles.miniCardTitle}>我的请假</span>
            <span className={styles.miniCardLink} onClick={() => navigate('/leave')}>
              全部 →
            </span>
          </div>
          <div className={styles.miniCardBody}>
            {!leavesPage ? (
              <div className={styles.miniCardEmpty}><Spin size="small" /></div>
            ) : recentLeaves.length === 0 ? (
              <div className={styles.miniCardEmpty}>暂无请假记录</div>
            ) : (
              recentLeaves.map((l) => (
                <div key={l.id} className={styles.miniListRow} onClick={() => navigate('/leave')}>
                  <div className={styles.miniListMain}>
                    <div className={styles.miniListTopRow}>
                      <span className={styles.miniListTitle}>
                        {l.leave_type_name} · {l.duration_days}天
                      </span>
                      <Tag
                        color={LEAVE_STATUS_COLORS[l.status]}
                        style={{ margin: 0, fontSize: 10.5 }}
                      >
                        {LEAVE_STATUS_LABELS[l.status]}
                      </Tag>
                    </div>
                    <div className={styles.miniListSub}>
                      {dayjs(l.start_time).format('MM-DD')}
                      {l.end_time ? ` 至 ${dayjs(l.end_time).format('MM-DD')}` : ''}
                    </div>
                    <LeaveStatusLine leave={l} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 我的勤工 — only renders when the student has any application; the
            auto-fit grid lets 我的请假 expand into the freed slot. */}
        {recentApps.length > 0 && (
          <div className={styles.miniCard}>
            <div className={styles.miniCardHeader}>
              <span className={styles.miniCardTitle}>我的勤工</span>
              <span className={styles.miniCardLink} onClick={() => navigate('/work-study')}>
                全部 →
              </span>
            </div>
            <div className={styles.miniCardBody}>
              {recentApps.map((a) => (
                <div key={a.id} className={styles.miniListRow} onClick={() => navigate('/work-study')}>
                  <div className={styles.miniListMain}>
                    <div className={styles.miniListTopRow}>
                      <span className={styles.miniListTitle}>
                        {a.intro?.slice(0, 18) || `岗位 #${a.position_id}`}
                      </span>
                      <Tag
                        color={APPLICATION_STATUS_COLORS[a.status] ?? 'default'}
                        style={{ margin: 0, fontSize: 10.5 }}
                      >
                        {APPLICATION_STATUS_LABELS[a.status] ?? a.status}
                      </Tag>
                    </div>
                    <div className={styles.miniListSub}>
                      {dayjs(a.created_at).format('MM-DD')} 申请
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 本学期足迹时间线 */}
      <FootprintTimeline leaves={leaves} apps={apps} term={term} />

      {/* 本学期请假分布热力图 */}
      <LeaveHeatmap leaves={leaves} term={term} />
    </div>
  );
}
