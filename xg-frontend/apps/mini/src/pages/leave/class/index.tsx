import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  listClassLeaves,
  listUncancelledLeaves,
  confirmCancelLeave,
  forceCancelLeave,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  type LeaveRequest,
} from '../../../api/leave';
import styles from './index.module.css';

/* 班级请假总览（辅导员）—— Apple 玻璃感 × Feed archetype。
 *
 * 双 tab:
 *   · 全部 — /leaves/class，按 status/起止 过滤后的所有班级请假
 *   · 未销假 — /leaves/uncancelled，已批但学生未销，含强制销假入口
 *
 * 区别于「请假审批」：审批页只看"我作为审批人"的待办；本页是"班级
 * 视角"，包括已批准 / 已驳回 / 已撤销等所有状态——给辅导员补全班级动态。
 */

type TabKey = 'all' | 'uncancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'uncancelled', label: '未销假' },
];

function formatDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export default function ClassLeavePage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (which: TabKey) => {
    setLoading(true);
    try {
      const fetcher = which === 'uncancelled' ? listUncancelledLeaves : listClassLeaves;
      const res = await fetcher({ page: 1, size: 100 });
      setItems(res.data ?? []);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);
  useDidShow(() => { load(tab); });

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/leave/detail/index?id=${id}` });
  };

  const onConfirmCancel = (id: string) => {
    Taro.showModal({
      title: '确认销假',
      content: '确认该学生的销假申请？通过后状态变为「已销」。',
      confirmText: '确认',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusyId(id);
        try {
          await confirmCancelLeave(id);
          Taro.showToast({ title: '已确认销假', icon: 'success' });
          await load(tab);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '确认失败', icon: 'none' });
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const onForceCancel = (id: string) => {
    Taro.showModal({
      title: '强制销假',
      content: '此操作不可撤销，仅在学生未自行销假时使用。',
      confirmText: '确认强制销假',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusyId(id);
        try {
          await forceCancelLeave(id);
          Taro.showToast({ title: '已强制销假', icon: 'success' });
          await load(tab);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '操作失败', icon: 'none' });
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>班级请假</Text>
        <Text className={styles.heroSubtitle}>
          共 <Text className="num">{items.length}</Text> 条
        </Text>
      </View>

      <View className={styles.tabsWrap}>
        <View className={styles.tabs}>
          {TABS.map((t) => (
            <View
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''} tap-min`}
              onClick={() => setTab(t.key)}
            >
              <Text className={styles.tabLabel}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : items.length === 0 ? (
        <View className={styles.empty}>
          {tab === 'uncancelled' ? '没有未销假的请假记录' : '本班暂无请假'}
        </View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {items.map((r) => {
            const tone = LEAVE_STATUS_TONES[r.status];
            const showConfirmBtn = r.status === 'cancel_pending';
            const showForceBtn = r.status === 'approved' && tab === 'uncancelled';
            return (
              <View key={r.id} className={styles.card} onClick={() => goDetail(r.id)}>
                <View className={styles.cardHeader}>
                  <View className={styles.titleWrap}>
                    <Text className={styles.cardTitle}>
                      {r.student_name ?? '未知学生'}
                      <Text className={styles.titleDim}> · {r.leave_type_name ?? '请假'}</Text>
                    </Text>
                  </View>
                  <Text className={`${styles.statusPill} ${styles[`tone_${tone}`]}`}>
                    {LEAVE_STATUS_LABELS[r.status]}
                  </Text>
                </View>
                <View className={styles.metaRow}>
                  <Text className={styles.metaText}>
                    <Text className="num">{formatDate(r.start_time)} ~ {formatDate(r.end_time)}</Text>
                  </Text>
                  <Text className={styles.duration}>
                    <Text className="num">{r.duration_days}</Text>
                    <Text className={styles.durationUnit}> 天</Text>
                  </Text>
                </View>
                {r.reason && (
                  <Text className={styles.reason} numberOfLines={2}>
                    {r.reason}
                  </Text>
                )}
                {(showConfirmBtn || showForceBtn) && (
                  <View className={styles.actions}>
                    {showConfirmBtn && (
                      <View
                        className={`${styles.actionBtn} ${styles.actionPrimary} tap-min`}
                        onClick={(e) => { e.stopPropagation(); onConfirmCancel(r.id); }}
                      >
                        <Text className={styles.actionLabel}>
                          {busyId === r.id ? '处理中…' : '确认销假'}
                        </Text>
                      </View>
                    )}
                    {showForceBtn && (
                      <View
                        className={`${styles.actionBtn} ${styles.actionDanger} tap-min`}
                        onClick={(e) => { e.stopPropagation(); onForceCancel(r.id); }}
                      >
                        <Text className={styles.actionLabelDanger}>
                          {busyId === r.id ? '处理中…' : '强制销假'}
                        </Text>
                      </View>
                    )}
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
