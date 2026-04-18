import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.css';

export default function Login() {
  const handleLogin = async () => {
    try {
      const { code } = await Taro.login();
      // TODO: Send code to backend for session exchange
      console.log('WeChat login code:', code);
      Taro.switchTab({ url: '/pages/index/index' });
    } catch (err) {
      Taro.showToast({ title: '登录失败', icon: 'error' });
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.logo}>
        <Text className={styles.logoIcon}>🎓</Text>
        <Text className={styles.logoTitle}>学工管理系统</Text>
        <Text className={styles.logoSubtitle}>AI 原生学生工作服务平台</Text>
      </View>
      <Button className={styles.loginBtn} onClick={handleLogin}>
        微信登录
      </Button>
    </View>
  );
}
