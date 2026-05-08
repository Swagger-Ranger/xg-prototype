import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { listPendingEnriched, type MiniPendingTask, type RiskLevel } from '../../../api/workflow';
import styles from './index.module.css';

/* 请假审批 — Apple 玻璃感 × Feed archetype。
 * 列出"我作为审批人"的待审任务（biz_type === 'leave'），
 * 点击进入 detail 页（带 taskId 参数）触发批准/驳回 UI。
 */

const RISK_LABEL: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

function formatDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export default function LeaveApprovalPage() {
  const [items, setItems] = useState<MiniPendingTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const userId = String(Taro.getStorageSync('userId') || '');
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listPendingEnriched({ page: 1, size: 100, assigneeId: userId });
      // 仅保留请假；其它业务（如勤工申请）走自己的页面
      const leaves = (res.data ?? []).filter((t) => t.biz_type === 'leave');
      setItems(leaves);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 审批完成回到列表后刷新
  useDidShow(() => {
    load();
  });

  const goDetail = (task: MiniPendingTask) => {
    if (!task.biz_id) return;
    Taro.navigateTo({
      url: `/pages/leave/detail/index?id=${task.biz_id}&taskId=${task.id}`,
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>请假审批</Text>
        <Text className={styles.heroSubtitle}>
          待审 <Text className="num">{items.length}</Text> 条
        </Text>
      </View>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : items.length === 0 ? (
        <View className={styles.empty}>暂无待审请假</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {items.map((t) => {
            const days = t.leave_duration_days ?? '?';
            const range =
              t.leave_start_time && t.leave_end_time
                ? `${formatDate(t.leave_start_time)} ~ ${formatDate(t.leave_end_time)}`
                : '';
            return (
              <View key={t.id} className={styles.card} onClick={() => goDetail(t)}>
                <View className={styles.cardHeader}>
                  <View className={styles.titleWrap}>
                    <Text className={styles.cardTitle}>
                      {t.initiator_name ?? '未知学生'}
                      <Text className={styles.titleDim}> · {t.leave_type_name ?? '请假'}</Text>
                    </Text>
                    <Text className={styles.nodeMeta}>{t.node_name}</Text>
                  </View>
                  <Text className={`${styles.riskPill} ${styles[`risk_${t.risk_level}`]}`}>
                    风险{RISK_LABEL[t.risk_level]}
                  </Text>
                </View>

                <View className={styles.metaRow}>
                  {range && (
                    <Text className={styles.metaText}>
                      <Text className="num">{range}</Text>
                    </Text>
                  )}
                  <Text className={styles.duration}>
                    <Text className="num">{days}</Text>
                    <Text className={styles.durationUnit}> 天</Text>
                  </Text>
                </View>

                {t.leave_reason && (
                  <Text className={styles.reason} numberOfLines={2}>
                    {t.leave_reason}
                  </Text>
                )}

                {t.reasons.length > 0 && (
                  <View className={styles.tags}>
                    {t.reasons.slice(0, 3).map((r, i) => (
                      <Text key={i} className={styles.tag}>{r}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
