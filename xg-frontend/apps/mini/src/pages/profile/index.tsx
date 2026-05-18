import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon } from '../../utils/icons';
import styles from './index.module.css';

/* 个人中心 — Notion × Profile archetype。
 *
 * Phase A：身份卡 + 切换身份占位 + 退出。退出已可用；切换身份在 Phase B
 * 接入（用户多角色时弹 actionSheet 切换 roleCode 并回写 storage）。
 */

const ROLE_LABELS: Record<string, string> = {
  student: '学生',
  counselor: '辅导员',
  college_admin: '院系管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  employer: '用人单位',
  aid_center_officer: '资助中心',
};

interface MiniUser {
  username?: string;
  realName?: string;
  roleCodes?: string[];
}

export default function ProfilePage() {
  const [user, setUser] = useState<MiniUser | null>(null);
  // null = 还未读 storage；明确区分"未登录"和"loading"
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = Taro.getStorageSync('user') as MiniUser | undefined;
    if (raw) setUser(raw);
    setLoaded(true);
  }, []);

  const isLoggedIn = !!user;
  const roles = user?.roleCodes ?? [];
  const primaryRoleZh = roles[0] ? ROLE_LABELS[roles[0]] ?? roles[0] : '';
  const canSwitch = roles.length > 1;
  // 我的档案 仅学生可见——staff 调 /students-me 会拿 null（且对辅导员而言这条入口无意义）
  const isStudent = roles.includes('student');

  const handleSwitchRole = () => {
    if (!canSwitch) return;
    Taro.showToast({ title: '切换身份功能开发中', icon: 'none' });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        Taro.removeStorageSync('token');
        Taro.removeStorageSync('refreshToken');
        Taro.removeStorageSync('user');
        Taro.removeStorageSync('userId');
        Taro.reLaunch({ url: '/pages/login/index' });
      },
    });
  };

  const handleLogin = () => {
    Taro.reLaunch({ url: '/pages/login/index' });
  };

  /** 取头像首字符。中文姓名取第一字，否则取 username 首字大写。 */
  const initial = user?.realName
    ? user.realName.slice(0, 1)
    : user?.username
    ? user.username.slice(0, 1).toUpperCase()
    : '?';

  // 未登录态：身份卡占位 + 唯一 CTA「前往登录」，避免出现"切换身份/退出登录"
  // 这种对未登录者无意义的入口；同时不把"未知角色 / 仅有一个角色"这种
  // 误导文案露出去。
  if (loaded && !isLoggedIn) {
    return (
      <View className={styles.page}>
        <View className={styles.hero}>
          <Text className={`${styles.heroTitle} display`}>个人中心</Text>
        </View>

        <View className={styles.identityCard}>
          <View className={styles.avatar}>
            <Text className={styles.avatarText}>?</Text>
          </View>
          <View className={styles.identityText}>
            <Text className={styles.identityName}>未登录</Text>
            <Text className={styles.identityRole}>登录后查看个人信息和待办</Text>
          </View>
        </View>

        <View className={styles.list}>
          <View className={`${styles.row} tap-min`} onClick={handleLogin}>
            <View className={`${styles.rowIcon} ${styles.tone_accent}`}>
              <Icon name="user" color="currentColor" size={28} />
            </View>
            <View className={styles.rowText}>
              <Text className={styles.rowTitle}>前往登录</Text>
              <Text className={styles.rowHint}>使用学工号 / 工号登录</Text>
            </View>
            <Icon name="chevron-right" color="var(--fg-4)" size={24} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>个人中心</Text>
      </View>

      {/* 身份卡 */}
      <View className={styles.identityCard}>
        <View className={styles.avatar}>
          <Text className={styles.avatarText}>{initial}</Text>
        </View>
        <View className={styles.identityText}>
          <Text className={styles.identityName}>
            {user?.realName ?? user?.username ?? ''}
          </Text>
          <Text className={styles.identityRole}>
            {primaryRoleZh}
            {canSwitch && (
              <Text className={styles.roleMore}> · 共 {roles.length} 个角色</Text>
            )}
          </Text>
        </View>
      </View>

      {/* 操作列表 — 切换身份仅在多角色时展示，避免单角色账号出现误导入口 */}
      <View className={styles.list}>
        {isStudent && (
          <View
            className={`${styles.row} tap-min`}
            onClick={() => Taro.navigateTo({ url: '/pages/myProfile/index' })}
          >
            <View className={`${styles.rowIcon} ${styles.tone_accent}`}>
              <Icon name="file-text" color="currentColor" size={28} />
            </View>
            <View className={styles.rowText}>
              <Text className={styles.rowTitle}>我的档案</Text>
              <Text className={styles.rowHint}>基本信息 · 联系方式 · 近期请假</Text>
            </View>
            <Icon name="chevron-right" color="var(--fg-4)" size={24} />
          </View>
        )}

        {/* 知情权兜底（PRD §13.3）：仅学生、低调入口，不主推不弹窗 */}
        {isStudent && (
          <View
            className={`${styles.row} tap-min`}
            onClick={() => Taro.navigateTo({ url: '/pages/careMe/index' })}
          >
            <View className={`${styles.rowIcon} ${styles.tone_accent}`}>
              <Icon name="file-text" color="currentColor" size={28} />
            </View>
            <View className={styles.rowText}>
              <Text className={styles.rowTitle}>个人信息保护</Text>
              <Text className={styles.rowHint}>我的关怀记录</Text>
            </View>
            <Icon name="chevron-right" color="var(--fg-4)" size={24} />
          </View>
        )}

        {canSwitch && (
          <View className={`${styles.row} tap-min`} onClick={handleSwitchRole}>
            <View className={`${styles.rowIcon} ${styles.tone_accent}`}>
              <Icon name="user" color="currentColor" size={28} />
            </View>
            <View className={styles.rowText}>
              <Text className={styles.rowTitle}>切换身份</Text>
              <Text className={styles.rowHint}>在 {roles.length} 个角色之间切换</Text>
            </View>
            <Icon name="chevron-right" color="var(--fg-4)" size={24} />
          </View>
        )}

        <View className={`${styles.row} tap-min`} onClick={handleLogout}>
          <View className={`${styles.rowIcon} ${styles.tone_danger}`}>
            <Icon name="log-out" color="currentColor" size={28} />
          </View>
          <View className={styles.rowText}>
            <Text className={styles.rowTitle}>退出登录</Text>
            <Text className={styles.rowHint}>清除本地登录态，回到登录页</Text>
          </View>
          <Icon name="chevron-right" color="var(--fg-4)" size={24} />
        </View>
      </View>
    </View>
  );
}
