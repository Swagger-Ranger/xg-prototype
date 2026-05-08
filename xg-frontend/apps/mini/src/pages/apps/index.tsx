import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon, type IconName } from '../../utils/icons';
import styles from './index.module.css';

/* 应用 launcher — Bento 风 × Profile archetype。
 *
 *   ┌────────────────────────────┐
 *   │ Hero: "应用"               │
 *   ├──────────────┬─────────────┤
 *   │              │ workStudy   │
 *   │  leave       ├─────────────┤
 *   │  (大主卡)    │ schedule    │
 *   └──────────────┴─────────────┘
 */

interface MiniUser {
  realName?: string;
  roleCodes?: string[];
}

interface AppItem {
  key: string;
  icon: IconName;
  title: string;
  hint: string;
  path: string;
  tone: 'peach' | 'cream' | 'blue' | 'warn';
  size: 'large' | 'small';
}

function buildApps(roles: string[]): AppItem[] {
  const isStaff = roles.some((r) =>
    ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'].includes(r),
  );
  const leave: AppItem = isStaff
    ? {
        key: 'leave-manage',
        icon: 'edit',
        title: '请假审批',
        hint: '处理学生待审请假',
        path: '/pages/leave/approval/index',
        tone: 'peach',
        size: 'large',
      }
    : {
        key: 'leave-mine',
        icon: 'edit',
        title: '我的请假',
        hint: '提交请假、销假，查看进度',
        path: '/pages/leave/list/index',
        tone: 'peach',
        size: 'large',
      };
  const items: AppItem[] = [
    leave,
    {
      key: 'workstudy',
      icon: 'briefcase',
      title: '勤工助学',
      hint: '岗位与工资',
      path: '/pages/workStudy/index',
      tone: 'blue',
      size: 'small',
    },
  ];
  // 班级请假 仅辅导员可见——区别于「请假审批」（仅看我作为审批人的待办），
  // 这里是班级全量视图，包含强制销假入口
  if (isStaff) {
    items.push({
      key: 'leave-class',
      icon: 'file-text',
      title: '班级请假',
      hint: '全班动态 + 强制销假',
      path: '/pages/leave/class/index',
      tone: 'cream',
      size: 'small',
    });
  }
  // 我的勤工 仅对学生展示——辅导员 / 院长 不参与申请，藏起来减少噪音
  if (!isStaff) {
    items.push({
      key: 'my-workstudy',
      icon: 'wallet',
      title: '我的勤工',
      hint: '申请进度与薪资',
      path: '/pages/myWorkStudy/index',
      tone: 'cream',
      size: 'small',
    });
  }
  items.push(
    {
      key: 'notifications',
      icon: 'bell',
      title: '通知',
      hint: '消息与系统提醒',
      path: '/pages/notifications/index',
      tone: 'cream',
      size: 'small',
    },
    {
      key: 'schedule',
      icon: 'calendar',
      title: '我的课表',
      hint: '即将上线',
      path: '/pages/schedule/index',
      tone: 'warn',
      size: 'small',
    },
  );
  return items;
}

export default function AppsPage() {
  const [user, setUser] = useState<MiniUser | null>(null);

  useEffect(() => {
    const raw = Taro.getStorageSync('user') as MiniUser | undefined;
    if (raw) setUser(raw);
  }, []);

  const apps = buildApps(user?.roleCodes ?? []);

  const handleTap = (path: string) => {
    Taro.navigateTo({ url: path }).catch(() => {
      Taro.showToast({ title: '该模块即将上线', icon: 'none' });
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>应用</Text>
        <Text className={styles.heroSubtitle}>常用功能集中在这里</Text>
      </View>

      <View className={styles.grid}>
        {apps.map((app) => (
          <View
            key={app.key}
            className={`${styles.cell} ${styles[`tone_${app.tone}`]} ${
              app.size === 'large' ? styles.cellLarge : styles.cellSmall
            } tap-min`}
            onClick={() => handleTap(app.path)}
          >
            <View className={styles.iconWrap}>
              <Icon name={app.icon} color="currentColor" size={42} />
            </View>
            <View className={styles.text}>
              <Text className={styles.title}>{app.title}</Text>
              <Text className={styles.hint}>{app.hint}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
