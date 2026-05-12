import { Badge, Dropdown } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/useAuth';
import { getUnreadCount } from '@/api/notification';
import UserAvatar from '@/components/avatar/UserAvatar';
import ZhaoxiLogo from '@/components/brand/ZhaoxiLogo';
import styles from './TopBar.module.css';

const ROUTE_KEYS: Array<[prefix: string, key: string]> = [
  ['/workspace', 'workspace'],
  ['/leave', 'leave'],
  ['/collection', 'collection'],
  ['/checkin', 'checkin'],
  ['/notification', 'notification'],
  ['/student', 'student'],
  ['/work-log', 'workLog'],
  ['/violation', 'violation'],
  ['/alerts', 'alerts'],
  ['/work-study', 'workStudy'],
  ['/system', 'system'],
  ['/knowledge', 'knowledge'],
];

export default function TopBar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { isStudent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'profile') {
      navigate('/profile');
    } else if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: t('topbar.profile') },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: t('topbar.logout'), danger: true },
  ];

  const matched = ROUTE_KEYS.find(([prefix]) => location.pathname.startsWith(prefix));
  // Student-side relabel: /workspace shows as 校园 instead of 工作台 since
  // students don't "work" — it's their school-life dashboard.
  const crumbCurrent = matched
    ? matched[1] === 'workspace' && isStudent
      ? '校园'
      : t(`routes.${matched[1]}`)
    : '';
  const homeLabel = isStudent ? '校园' : '工作台';

  return (
    <header className={styles.topBar}>
      <div className={styles.crumbs}>
        <button
          type="button"
          className={styles.crumbHome}
          onClick={() => navigate('/workspace')}
          aria-label={`朝夕 · 返回${homeLabel}`}
        >
          <ZhaoxiLogo size={22} withWord wordSize={15} />
        </button>
        {crumbCurrent && (
          <>
            <span className={styles.crumbSep}>/</span>
            <span className={styles.crumbCurrent}>{crumbCurrent}</span>
          </>
        )}
      </div>
      <div className={styles.spacer} />
      {/* 通知入口:数字角标直接挂在铃铛上,旧版独立的「N 条未读」pill 已并入这里。 */}
      <Badge count={unreadCount} size="small" overflowCount={99} offset={[-4, 4]}>
        <button
          className={styles.iconBtn}
          onClick={() => navigate('/notification')}
          aria-label={unreadCount > 0 ? `${unreadCount} ${t('topbar.unreadSuffix')}` : '通知'}
        >
          <BellOutlined />
        </button>
      </Badge>
      <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight">
        <button className={styles.avatar} aria-label="账户菜单">
          <UserAvatar
            avatarUrl={user?.avatar_url}
            seed={user?.id ?? user?.username ?? 'guest'}
            name={user?.real_name ?? user?.username}
            size={32}
          />
        </button>
      </Dropdown>
    </header>
  );
}
