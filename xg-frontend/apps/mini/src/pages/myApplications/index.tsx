import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { listMyApplications, type MiniApplication } from '../../api/workStudy';
import styles from './index.module.css';

const STATUS_LABEL: Record<string, string> = {
  pending: '审批中',
  hired: '已录用',
  rejected: '未通过',
  recommended: '已推荐',
};

const STATUS_CLASS: Record<string, string> = {
  pending: styles.statusPending,
  hired: styles.statusHired,
  rejected: styles.statusRejected,
};

export default function MyApplications() {
  const [apps, setApps] = useState<MiniApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = String(Taro.getStorageSync('userId') || '');
    if (!userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    let cancelled = false;
    listMyApplications(userId, 1, 50)
      .then((res) => {
        if (cancelled) return;
        setApps(res.data ?? []);
      })
      .catch((err: Error) => Taro.showToast({ title: err.message, icon: 'none' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const counts = apps.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <View className={styles.page}>
      <View className={styles.summary}>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryValue}>{apps.length}</Text>
          <Text className={styles.summaryLabel}>总申请</Text>
        </View>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryValue}>{counts.pending ?? 0}</Text>
          <Text className={styles.summaryLabel}>审批中</Text>
        </View>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryValue}>{counts.hired ?? 0}</Text>
          <Text className={styles.summaryLabel}>已录用</Text>
        </View>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryValue}>{counts.rejected ?? 0}</Text>
          <Text className={styles.summaryLabel}>未通过</Text>
        </View>
      </View>

      {loading ? (
        <View className={styles.loading}>加载中…</View>
      ) : apps.length === 0 ? (
        <View className={styles.empty}>还没有申请记录</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {apps.map((a) => (
            <View
              key={a.id}
              className={styles.card}
              onClick={() => Taro.navigateTo({ url: `/pages/workStudyDetail/index?id=${a.position_id}` })}
            >
              <View className={styles.cardHeader}>
                <Text className={styles.posId}>
                  {a.position_summary?.title || `岗位 #${a.position_id}`}
                </Text>
                <Text className={`${styles.statusTag} ${STATUS_CLASS[a.status] || ''}`}>
                  {STATUS_LABEL[a.status] || a.status}
                </Text>
              </View>
              <Text className={styles.intro}>{a.intro}</Text>
              <Text className={styles.timestamp}>提交于 {a.created_at?.slice(0, 10)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
