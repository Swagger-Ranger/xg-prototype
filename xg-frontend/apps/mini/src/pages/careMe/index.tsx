import { useState, useCallback } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { getCareActiveSummary, type CareActiveSummary } from '../../api/care';
import styles from './index.module.css';

/* 我的关怀记录 — 学生只读知情权兜底（PRD §13.3）。
 *
 * 合规红线：只展示后端渲染好的类型摘要文案；不显示分数 / 排名 / 规则名 /
 * 严重度 / 辅导员 / 谁查看过 / 触发证据。全部关闭时显示温和兜底文案。
 * 本页不主推、不弹窗、不通知——仅当学生主动进来时才查到。
 */
export default function CareMePage() {
  const [data, setData] = useState<CareActiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getCareActiveSummary()
      .then(setData)
      .catch((e: Error) => Taro.showToast({ title: e.message, icon: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  useDidShow(() => {
    load();
  });

  const items = data?.items ?? [];
  const isEmpty = !loading && items.length === 0;

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>我的关怀记录</Text>
        <Text className={styles.heroSubtitle}>
          学校在你需要时会主动关心你。这里只让你知道当前有哪些类型的关心。
        </Text>
      </View>

      {loading && <View className={styles.state}>加载中…</View>}

      {isEmpty && (
        <View className={styles.emptyCard}>
          <Text className={styles.emptyText}>
            {data?.message ?? '目前无主动关心记录'}
          </Text>
        </View>
      )}

      {!loading && items.length > 0 && (
        <ScrollView scrollY className={styles.list}>
          {items.map((it) => (
            <View className={styles.card} key={it.category}>
              <Text className={styles.cardCategory}>{it.category}</Text>
              <Text className={styles.cardMessage}>{it.message}</Text>
            </View>
          ))}
          <Text className={styles.footnote}>
            如果你觉得某条关心不太准确，可以在和老师沟通时直接说明。
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
