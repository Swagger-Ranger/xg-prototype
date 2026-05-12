import {
  HomeOutlined,
  CalendarOutlined,
  SnippetsOutlined,
  EnvironmentOutlined,
  BellOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  AlertOutlined,
  DeploymentUnitOutlined,
  FormOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/useAuth';
import styles from './NavRail.module.css';

const navItems = [
  { key: '/workspace', icon: <HomeOutlined />, label: '工作台', permission: null },
  { key: '/leave', icon: <CalendarOutlined />, label: '请销假', permission: null },
  { key: '/collection', icon: <SnippetsOutlined />, label: '信息收集', permission: 'collection:manage' },
  { key: '/checkin', icon: <EnvironmentOutlined />, label: '签到', permission: 'checkin:manage' },
  { key: '/notification', icon: <BellOutlined />, label: '我的通知', permission: null },
  { key: '/student', icon: <TeamOutlined />, label: '学生信息库', permission: 'student:view' },
  { key: '/work-log', icon: <EditOutlined />, label: '工作日志', permission: 'worklog:manage' },
  { key: '/violation', icon: <ExclamationCircleOutlined />, label: '违纪处分', permission: 'discipline:manage' },
  { key: '/alerts', icon: <AlertOutlined />, label: '异常预警', permission: 'student:view' },
  { key: '/counselor-talks', icon: <MessageOutlined />, label: '辅导谈话', permission: 'worklog:manage' },
  { key: '/work-study', icon: <span className={styles.navTextIcon}>勤</span>, label: '勤工助学', permission: null },
];

const bottomItems = [
  { key: '/workflows', icon: <DeploymentUnitOutlined />, label: '工作流定义', permission: 'system:manage' },
  { key: '/forms', icon: <FormOutlined />, label: '表单管理', permission: 'system:manage' },
  { key: '/system/users', icon: <SettingOutlined />, label: '系统管理', permission: 'system:manage' },
];

// employer 是单一职责角色，只看勤工助学；其他菜单（含 AI 工作台、请销假、
// 学生信息、通知任务等）一律屏蔽，避免误入。
const EMPLOYER_ALLOWED_KEYS = new Set(['/work-study']);

// 角色级菜单黑名单：即便权限码允许，这些项也按产品需求隐藏。改这里就够了，
// 不用动 sys_role_permission（学生还需要 student:view 看自己档案，把权限
// 删了反而会破坏其它页面）。
const HIDDEN_KEYS_BY_ROLE: Record<string, ReadonlySet<string>> = {
  student: new Set(['/notification', '/student', '/alerts']),
  counselor: new Set([
    '/collection',
    '/checkin',
    '/notification',
    '/work-log',
    '/alerts',
    '/counselor-talks',
  ]),
  dean: new Set([
    '/collection',
    '/checkin',
    '/notification',
    '/violation',
    '/alerts',
  ]),
};

export default function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission, isEmployer, isStudent, isCounselor, isDean } = useAuth();
  const logout = useAuthStore((s) => s.logout);

  // Compose a single hidden-set for the current viewer. A user with multiple
  // roles only inherits hidden items shared across all of them — i.e. if any
  // active role allows a menu, it shows.
  const hiddenByRole = (() => {
    const sets: ReadonlySet<string>[] = [];
    if (isStudent) sets.push(HIDDEN_KEYS_BY_ROLE.student);
    if (isCounselor) sets.push(HIDDEN_KEYS_BY_ROLE.counselor);
    if (isDean) sets.push(HIDDEN_KEYS_BY_ROLE.dean);
    if (sets.length === 0) return new Set<string>();
    // Intersection: hide only items every role wants hidden.
    const [first, ...rest] = sets;
    return new Set([...first].filter((k) => rest.every((s) => s.has(k))));
  })();

  const visibleNavItems = navItems.filter((item) => {
    if (isEmployer) return EMPLOYER_ALLOWED_KEYS.has(item.key);
    if (hiddenByRole.has(item.key)) return false;
    return item.permission === null || hasPermission(item.permission);
  });

  const visibleBottomItems = isEmployer
    ? []
    : bottomItems.filter(
        (item) => item.permission === null || hasPermission(item.permission),
      );

  return (
    <nav className={styles.rail}>
      <div className={styles.navItems}>
        {visibleNavItems.map((item) => {
          // Students see /workspace as 校园 (their school life dashboard);
          // counselor / dean / admin keep 工作台. Done at the tooltip level so
          // the route key + nav definition stay shared across roles.
          const label = item.key === '/workspace' && isStudent ? '校园' : item.label;
          return (
            <Tooltip key={item.key} title={label} placement="right">
              <button
                className={`${styles.navItem} ${location.pathname.startsWith(item.key) ? styles.active : ''}`}
                onClick={() => navigate(item.key)}
              >
                {item.icon}
              </button>
            </Tooltip>
          );
        })}
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
