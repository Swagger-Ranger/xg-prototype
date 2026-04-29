import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { listOpenPositions, type MiniPosition } from '../../api/workStudy';
import styles from './index.module.css';

const SALARY_UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

export default function WorkStudyList() {
  const [positions, setPositions] = useState<MiniPosition[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOpenPositions(1, 50)
      .then((res) => {
        if (cancelled) return;
        setPositions(res.data ?? []);
        setTotal(Number(res.total ?? 0));
      })
      .catch((err: Error) => {
        Taro.showToast({ title: err.message || '加载失败', icon: 'none' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/workStudyDetail/index?id=${id}` });
  };

  return (
    <View className={styles.page}>
      <View className={styles.toolbar}>
        <View>
          <Text className={styles.toolbarTitle}>在招岗位</Text>
        </View>
        <Text className={styles.toolbarSubtitle}>共 {total} 个</Text>
      </View>

      <View
        className={styles.aiEntry}
        onClick={() => Taro.navigateTo({ url: '/pages/workStudyMatch/index' })}
      >
        <Text className={styles.aiEntryIcon}>🤖</Text>
        <View className={styles.aiEntryText}>
          <Text className={styles.aiEntryTitle}>AI 帮我找适合的</Text>
          <Text className={styles.aiEntryHint}>选时段 + 偏好，自动推荐</Text>
        </View>
        <Text className={styles.aiEntryArrow}>›</Text>
      </View>

      {loading ? (
        <View className={styles.loading}>加载中…</View>
      ) : positions.length === 0 ? (
        <View className={styles.empty}>暂无符合你条件的岗位</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {positions.map((p) => (
            <View key={p.id} className={styles.card} onClick={() => goDetail(p.id)}>
              <View className={styles.cardHeader}>
                <Text className={styles.cardTitle}>{p.title}</Text>
                <Text
                  className={`${styles.typeBadge} ${p.position_type === 'temporary' ? styles.tempBadge : ''}`}
                >
                  {p.position_type === 'temporary' ? '临时岗' : '固定岗'}
                </Text>
              </View>
              <View className={styles.meta}>
                {p.department_name && <Text className={styles.metaItem}>📍 {p.department_name}</Text>}
                {p.campus && <Text className={styles.metaItem}>🏫 {p.campus}</Text>}
                {p.weekly_hours && (
                  <Text className={styles.metaItem}>⏱ 周 {p.weekly_hours} 小时</Text>
                )}
              </View>
              <View className={styles.meta}>
                {(p.salary_amount || p.hourly_rate) && (
                  <Text className={styles.salary}>
                    ¥{Number(p.salary_amount || p.hourly_rate).toFixed(2)} / {SALARY_UNIT_LABEL[p.salary_unit || 'hour'] || '时'}
                  </Text>
                )}
                <Text className={styles.headcount}>
                  招 {p.hired_count ?? 0}/{p.headcount ?? '?'}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
