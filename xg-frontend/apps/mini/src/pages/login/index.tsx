import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login } from '../../api/auth';
import styles from './index.module.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    try {
      setLoading(true);
      const resp = await login({
        username: username.trim(),
        password,
        tenantId: tenantId.trim() || 'default',
      });
      Taro.setStorageSync('token', resp.token);
      Taro.setStorageSync('userId', resp.user.id);
      Taro.setStorageSync('tenantId', resp.user.tenantId || tenantId);
      Taro.setStorageSync('user', resp.user);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      Taro.switchTab({ url: '/pages/index/index' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.logo}>
        <Text className={styles.logoIcon}>🎓</Text>
        <Text className={styles.logoTitle}>学工管理系统</Text>
        <Text className={styles.logoSubtitle}>AI 原生学生工作服务平台</Text>
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
        <Text className={styles.devTip}>P0 阶段使用账号密码；微信一键登录将于 P1 接入。</Text>
      </View>
    </View>
  );
}
