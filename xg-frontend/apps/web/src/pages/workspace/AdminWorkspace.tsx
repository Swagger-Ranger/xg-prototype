import { useNavigate } from 'react-router-dom';
import { Empty, Spin, Tag } from 'antd';
import {
  ApartmentOutlined,
  BellOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  EditOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getWorkspaceMetrics, type AdminMetrics } from '@/api/insight';
import { useAuth } from '@/hooks/useAuth';
import QuickStartPanel from './components/QuickStartPanel';
import styles from './index.module.css';

function pct(num?: number, den?: number): string {
  const n = Number(num ?? 0);
  const d = Number(den ?? 0);
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

export default function AdminWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery<AdminMetrics>({
    queryKey: ['workspaceMetrics', 'school_admin'],
    queryFn: () => getWorkspaceMetrics('school_admin'),
    refetchInterval: 120000,
  });

  const m: AdminMetrics = data ?? {};

  const wfRate = pct(m.workflow_completed_7d, m.workflow_finished_7d);
  const notifRate = pct(m.notif_sent_24h, m.notif_total_24h);

  const cards = [
    {
      label: '工作流通过率',
      value: wfRate,
      icon: <ApartmentOutlined />,
      href: '/workflows',
      footer: `近 7 天 ${m.workflow_completed_7d ?? 0}/${m.workflow_finished_7d ?? 0}`,
    },
    {
      label: '通知到达率',
      value: notifRate,
      icon: <BellOutlined />,
      href: '/notification',
      footer: `近 24h ${m.notif_sent_24h ?? 0}/${m.notif_total_24h ?? 0}`,
    },
    {
      label: '今日活跃',
      value: m.today_active_users ?? 0,
      icon: <TeamOutlined />,
      href: '/system/user',
      footer: '审计日志去重',
    },
    {
      label: 'AI 服务',
      value: '在线',
      icon: <ThunderboltOutlined />,
      href: '/system',
      footer: 'sidecar 心跳',
    },
  ];

  const failures = m.notif_failures_24h ?? [];
  const stuck = m.stuck_workflows ?? [];
  const noAnomaly = failures.length === 0 && stuck.length === 0;

  const drafts = m.my_workflow_drafts ?? [];
  const audits = m.my_recent_audits ?? [];

  return (
    <div className={styles.workspace}>
      {user?.real_name && <div className={styles.greeting}>你好，{user.real_name}</div>}

      <QuickStartPanel />

      <div className={styles.sectionLabel}>
        <span>系统脉搏</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.statGrid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.statCard} onClick={() => navigate(c.href)}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{c.label}</span>
              <span className={styles.statIcon}>{c.icon}</span>
            </div>
            <div className={styles.statValue}>{c.value}</div>
            <div className={styles.statFooter}>
              <span>{c.footer}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sectionLabel}>
        <span>系统异常</span>
        <div className={styles.sectionLine} />
      </div>

      {isLoading ? (
        <div className={styles.todoList}>
          <div className={styles.todoEmpty}><Spin size="small" /></div>
        </div>
      ) : noAnomaly ? (
        <div className={styles.todoList}>
          <div className={styles.todoEmpty}>今日运转平稳，无系统异常。</div>
        </div>
      ) : (
        <div className={styles.contentGrid}>
          <div className={styles.miniCard}>
            <div className={styles.miniCardHeader}>
              <span className={styles.miniCardTitle}>
                <WarningOutlined style={{ marginRight: 6 }} />
                通知发送失败 · 近 24h ({failures.length})
              </span>
              <span className={styles.miniCardLink} onClick={() => navigate('/notification')}>
                全部
              </span>
            </div>
            <div className={styles.miniCardBody}>
              {failures.length === 0 ? (
                <div className={styles.miniCardEmpty}>无失败记录</div>
              ) : (
                failures.map((f) => (
                  <div
                    key={String(f.id)}
                    className={styles.miniListRow}
                    onClick={() => navigate(`/notification?id=${f.notification_id}`)}
                  >
                    <div className={styles.miniListMain}>
                      <div className={styles.miniListTopRow}>
                        <span className={styles.miniListTitle}>{f.title || '(无标题)'}</span>
                        <Tag color="red" style={{ marginInlineEnd: 0 }}>{f.channel}</Tag>
                      </div>
                      <div className={styles.miniListSub}>
                        {f.user_name || `用户 #${f.user_id}`} · 重试 {f.retry_count ?? 0} 次 ·{' '}
                        {dayjs(f.created_at).format('MM-DD HH:mm')}
                      </div>
                      {f.last_error && (
                        <div className={`${styles.miniListDetail} ${styles.miniListDetail}`}>
                          {f.last_error}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.miniCard}>
            <div className={styles.miniCardHeader}>
              <span className={styles.miniCardTitle}>
                <WarningOutlined style={{ marginRight: 6 }} />
                长期未推进工作流 · 超 7 天 ({stuck.length})
              </span>
              <span className={styles.miniCardLink} onClick={() => navigate('/workflows')}>
                全部
              </span>
            </div>
            <div className={styles.miniCardBody}>
              {stuck.length === 0 ? (
                <div className={styles.miniCardEmpty}>无卡住实例</div>
              ) : (
                stuck.map((w) => (
                  <div
                    key={String(w.id)}
                    className={styles.miniListRow}
                    onClick={() => navigate(`/workflows?instance=${w.id}`)}
                  >
                    <div className={styles.miniListMain}>
                      <div className={styles.miniListTopRow}>
                        <span className={styles.miniListTitle}>
                          {w.definition_name || w.biz_type}
                        </span>
                        <Tag style={{ marginInlineEnd: 0 }}>{w.current_node_id}</Tag>
                      </div>
                      <div className={styles.miniListSub}>
                        发起人 {w.initiator_name || `#${w.initiator_id ?? '-'}`} ·{' '}
                        启动 {dayjs(w.started_at).format('MM-DD HH:mm')} ·{' '}
                        已滞留 {dayjs().diff(dayjs(w.started_at), 'day')} 天
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className={styles.sectionLabel}>
        <span>我的工作台</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.miniCard}>
          <div className={styles.miniCardHeader}>
            <span className={styles.miniCardTitle}>
              <EditOutlined style={{ marginRight: 6 }} />
              我的草稿 · 工作流 ({drafts.length})
            </span>
            <span className={styles.miniCardLink} onClick={() => navigate('/workflows')}>
              去工作流
            </span>
          </div>
          <div className={styles.miniCardBody}>
            {drafts.length === 0 ? (
              <Empty
                description="没有未发布的草稿"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: '24px 0' }}
              />
            ) : (
              drafts.map((d) => (
                <div
                  key={String(d.id)}
                  className={styles.miniListRow}
                  onClick={() => navigate(`/workflows?definition=${d.id}`)}
                >
                  <div className={styles.miniListMain}>
                    <div className={styles.miniListTopRow}>
                      <span className={styles.miniListTitle}>{d.name}</span>
                      <Tag style={{ marginInlineEnd: 0 }}>v{d.version}</Tag>
                    </div>
                    <div className={styles.miniListSub}>
                      {d.module} · 最近编辑 {dayjs(d.updated_at).format('MM-DD HH:mm')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.miniCard}>
          <div className={styles.miniCardHeader}>
            <span className={styles.miniCardTitle}>
              <HistoryOutlined style={{ marginRight: 6 }} />
              我的近 7 天变更 ({audits.length})
            </span>
          </div>
          <div className={styles.miniCardBody}>
            {audits.length === 0 ? (
              <Empty
                description="近 7 天暂无变更"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: '24px 0' }}
              />
            ) : (
              audits.map((a) => (
                <div key={String(a.id)} className={styles.miniListRow}>
                  <div className={styles.miniListMain}>
                    <div className={styles.miniListTopRow}>
                      <span className={styles.miniListTitle}>
                        {a.description || `${a.action} ${a.target_type ?? ''}`}
                      </span>
                      <Tag style={{ marginInlineEnd: 0 }}>{a.action}</Tag>
                    </div>
                    <div className={styles.miniListSub}>
                      {a.module} · {dayjs(a.created_at).format('MM-DD HH:mm')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
