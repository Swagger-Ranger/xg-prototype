import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon, type IconName } from '../../utils/icons';
import { login } from '../../api/auth';
import styles from './index.module.css';

/* 登录 — 含「快速登录」一键切换角色面板。
 *
 * 种子账号统一密码 xg@123456，见 backend tenant migration V021/V022/V059。
 * Phase B 切回真实 SSO / 微信一键登录后，QUICK_USERS 整段可删。
 */

interface QuickUser {
  key: string;
  username: string;
  /** 中文角色名，按钮主标 */
  roleZh: string;
  /** 中文姓名，按钮副标 */
  realName: string;
  icon: IconName;
}

const QUICK_USERS: QuickUser[] = [
  { key: 'student',    username: 'stu_zhang',    roleZh: '学生',     realName: '张晓明', icon: 'user' },
  { key: 'counselor',  username: 'counselor_li', roleZh: '辅导员',   realName: '李老师', icon: 'edit' },
  { key: 'dean',       username: 'dean1',        roleZh: '院系领导', realName: '赵院长', icon: 'briefcase' },
  { key: 'officer',    username: 'officer1',     roleZh: '学工处',   realName: '周学工', icon: 'file-text' },
  { key: 'admin',      username: 'admin1',       roleZh: '校管理员', realName: '王管理', icon: 'gear' },
];

const QUICK_PASSWORD = 'xg@123456';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /** 通用登录提交。creds 不传则用表单输入。 */
  const submit = async (creds?: { username: string; password: string }) => {
    const u = creds?.username ?? username.trim();
    const p = creds?.password ?? password;
    if (!u || !p) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    try {
      const resp = await login({
        username: u,
        password: p,
        tenantId: tenantId.trim() || 'default',
      });
      Taro.setStorageSync('token', resp.token);
      Taro.setStorageSync('userId', resp.user.id);
      Taro.setStorageSync('tenantId', resp.user.tenantId || tenantId);
      Taro.setStorageSync('user', resp.user);
      Taro.showToast({ title: `已登录 · ${resp.user.realName ?? u}`, icon: 'success' });
      Taro.switchTab({ url: '/pages/home/index' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      Taro.showToast({ title: msg, icon: 'none' });
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      await submit();
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (q: QuickUser) => {
    if (busyKey) return;
    setBusyKey(q.key);
    try {
      await submit({ username: q.username, password: QUICK_PASSWORD });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.logo}>
        <View className={styles.logoMark}>
          <Text className={`${styles.logoMarkText} display`}>朝</Text>
        </View>
        <Text className={styles.logoTitle}>朝夕</Text>
        <Text className={styles.logoSubtitle}>AI 原生学生工作服务平台</Text>
      </View>

      {/* 快速登录 — 一键切换 demo 角色 */}
      <View className={styles.quickPanel}>
        <View className={styles.quickHead}>
          <Text className={styles.quickTitle}>一键登录</Text>
          <Text className={styles.quickHint}>选个角色直接进，演示用</Text>
        </View>
        <View className={styles.quickGrid}>
          {QUICK_USERS.map((q) => (
            <View
              key={q.key}
              className={`${styles.quickChip} ${busyKey === q.key ? styles.quickChipBusy : ''}`}
              onClick={() => handleQuickLogin(q)}
            >
              <View className={styles.quickIcon}>
                <Icon name={q.icon} color="#3a6df0" size={32} />
              </View>
              <Text className={styles.quickRole}>{q.roleZh}</Text>
              <Text className={styles.quickName}>{q.realName}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className={styles.divider}>
        <View className={styles.dividerLine} />
        <Text className={styles.dividerText}>或手动登录</Text>
        <View className={styles.dividerLine} />
      </View>

      <View className={styles.form}>
        <Text className={styles.label}>账号</Text>
        <Input
          className={styles.input}
          value={username}
          onInput={(e) => setUsername(e.detail.value)}
          placeholder="学号 / 教工号 / 用户名"
          maxlength={64}
        />
        <Text className={styles.label}>密码</Text>
        <Input
          className={styles.input}
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          password
          placeholder="请输入密码"
          maxlength={64}
        />
        <Text className={styles.label}>租户</Text>
        <Input
          className={styles.input}
          value={tenantId}
          onInput={(e) => setTenantId(e.detail.value)}
          placeholder="default"
          maxlength={32}
        />
        <Button className={styles.loginBtn} onClick={handleLogin} loading={loading}>
          登录
        </Button>
        <Text className={styles.devTip}>P0 演示阶段；微信一键登录将于 P1 接入</Text>
      </View>
    </View>
  );
}
