import {
  HomeOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  BellOutlined,
  MessageOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  EditOutlined,
  WarningOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/useAuth';
import styles from './NavRail.module.css';

const navItems = [
  { key: '/workspace', icon: <HomeOutlined />, label: '工作台', permission: null },
  { key: '/leave', icon: <FileTextOutlined />, label: '请销假', permission: null },
  { key: '/collection', icon: <CheckSquareOutlined />, label: '信息收集', permission: 'collection:manage' },
  { key: '/checkin', icon: <ClockCircleOutlined />, label: '签到', permission: 'checkin:manage' },
  { key: '/notification', icon: <BellOutlined />, label: '通知任务', permission: null },
  { key: '/complaint', icon: <MessageOutlined />, label: '接诉即办', permission: null },
  { key: '/student', icon: <TeamOutlined />, label: '学生信息', permission: 'student:view' },
  { key: '/work-log', icon: <EditOutlined />, label: '工作日志', permission: 'worklog:manage' },
  { key: '/violation', icon: <WarningOutlined />, label: '违纪处分', permission: 'discipline:manage' },
  { key: '/work-study', icon: <ShopOutlined />, label: '勤工助学', permission: null },
];

const bottomItems = [
  { key: '/system/users', icon: <SettingOutlined />, label: '系统管理', permission: 'system:manage' },
];

export default function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const logout = useAuthStore((s) => s.logout);

  const visibleNavItems = navItems.filter(
    (item) => item.permission === null || hasPermission(item.permission),
  );

  const visibleBottomItems = bottomItems.filter(
    (item) => item.permission === null || hasPermission(item.permission),
  );

  return (
    <nav className={styles.rail}>
      <div className={styles.navItems}>
        {visibleNavItems.map((item) => (
          <Tooltip key={item.key} title={item.label} placement="right">
            <button
              className={`${styles.navItem} ${location.pathname.startsWith(item.key) ? styles.active : ''}`}
              onClick={() => navigate(item.key)}
            >
              {item.icon}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className={styles.bottomItems}>
        {visibleBottomItems.map((item) => (
          <Tooltip key={item.key} title={item.label} placement="right">
            <button
              className={`${styles.navItem} ${location.pathname.startsWith(item.key) ? styles.active : ''}`}
              onClick={() => navigate(item.key)}
            >
              {item.icon}
            </button>
          </Tooltip>
        ))}
        <Tooltip title="退出登录" placement="right">
          <button
            className={`${styles.navItem} ${styles.logout}`}
            onClick={() => { logout(); navigate('/login'); }}
          >
            <LogoutOutlined />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
