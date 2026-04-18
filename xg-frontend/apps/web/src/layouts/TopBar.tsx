import { Avatar, Badge, Dropdown, message } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getUnreadCount } from '@/api/notification';
import styles from './TopBar.module.css';

export default function TopBar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'profile') {
      message.info('个人设置功能即将上线');
    } else if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人设置' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <h1 className={styles.title}>学工管理系统</h1>
      </div>
      <div className={styles.right}>
        <Badge count={unreadCount} size="small">
          <button className={styles.iconBtn} onClick={() => navigate('/notification')}>
            <BellOutlined />
          </button>
        </Badge>
        <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight">
          <button className={styles.userBtn}>
            <Avatar size={28} icon={<UserOutlined />} style={{ background: 'var(--ac)' }} />
            <span className={styles.userName}>{user?.real_name || '未登录'}</span>
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
