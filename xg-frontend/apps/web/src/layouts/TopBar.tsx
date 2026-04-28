import { Dropdown, message } from 'antd';
import { BellOutlined, SearchOutlined, UserOutlined, LogoutOutlined, GlobalOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth.store';
import { useLocaleStore } from '@/stores/locale.store';
import { getUnreadCount } from '@/api/notification';
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
  const lang = useLocaleStore((s) => s.lang);
  const toggleLang = useLocaleStore((s) => s.toggle);
  const navigate = useNavigate();
  const location = useLocation();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'profile') {
      message.info(t('topbar.profileSoon'));
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
  const crumbCurrent = matched ? t(`routes.${matched[1]}`) : '';
  const avatarLetter = user?.real_name?.trim()?.charAt(0) || user?.username?.charAt(0)?.toUpperCase() || '?';

  return (
    <header className={styles.topBar}>
      <div className={styles.crumbs}>
        <span className={styles.crumbHome} onClick={() => navigate('/workspace')}>{t('topbar.homeCrumb')}</span>
        {crumbCurrent && (
          <>
            <span className={styles.crumbSep}>/</span>
            <span className={styles.crumbCurrent}>{crumbCurrent}</span>
          </>
        )}
      </div>
      {unreadCount > 0 && (
        <span className={styles.metaPill}>{unreadCount} {t('topbar.unreadSuffix')}</span>
      )}
      <div className={styles.spacer} />
      <div className={styles.search} onClick={() => message.info(t('topbar.searchSoon'))}>
        <SearchOutlined />
        <span>{t('topbar.searchPlaceholder')}</span>
        <kbd>⌘K</kbd>
      </div>
      <button
        className={styles.iconBtn}
        onClick={toggleLang}
        title={t('topbar.languageToggleAria')}
        aria-label={t('topbar.languageToggleAria')}
      >
        <GlobalOutlined />
        <span style={{ marginLeft: 4, fontSize: 12 }}>
          {lang === 'zh' ? t('topbar.languageEn') : t('topbar.languageZh')}
        </span>
      </button>
      <button className={styles.iconBtn} onClick={() => navigate('/notification')}>
        <BellOutlined />
        {unreadCount > 0 && <span className={styles.notiDot} />}
      </button>
      <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight">
        <button className={styles.avatar}>{avatarLetter}</button>
      </Dropdown>
    </header>
  );
}
