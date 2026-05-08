import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  listMyLeaves,
  withdrawLeave,
  cancelLeave,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  type LeaveRequest,
  type LeaveStatus,
} from '../../../api/leave';
import styles from './index.module.css';

/* 我的请假 — Apple 玻璃感 × Feed archetype。
 * 学生侧：列表 + 状态过滤 + 申请请假 CTA + 卡片操作（撤回 / 销假）。
 */

interface StatusOption {
  label: string;
  value: '' | LeaveStatus;
}

const STATUS_OPTIONS: StatusOption[] = [
  { label: '全部', value: '' },
  { label: '审批中', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '销假中', value: 'cancel_pending' },
  { label: '已驳回', value: 'rejected' },
];

function formatDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function MyLeavesPage() {
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [status, setStatus] = useState<'' | LeaveStatus>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (filterStatus: '' | LeaveStatus) => {
    setLoading(true);
    try {
      const res = await listMyLeaves({
        page: 1,
        size: 50,
        status: filterStatus || undefined,
      });
      setItems(res.data ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败';
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [load, status]);

  // Refresh on return from apply / detail page so newly-submitted records show up.
  useDidShow(() => {
    load(status);
  });

  const goApply = () => {
    Taro.navigateTo({ url: '/pages/leave/apply/index' });
  };

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/leave/detail/index?id=${id}` });
  };

  const onWithdraw = (id: string) => {
    Taro.showModal({
      title: '确认撤回',
      content: '撤回后该申请将作废，可重新提交。',
      confirmText: '确定撤回',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusyId(id);
        try {
          await withdrawLeave(id);
          Taro.showToast({ title: '已撤回', icon: 'success' });
          await load(status);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '撤回失败', icon: 'none' });
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const onCancel = (id: string) => {
    Taro.showModal({
      title: '申请销假',
      content: '提交销假申请，由辅导员确认。',
      confirmText: '提交销假',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusyId(id);
        try {
          await cancelLeave(id);
          Taro.showToast({ title: '销假已提交', icon: 'success' });
          await load(status);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '销假失败', icon: 'none' });
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>我的请假</Text>
        <Text className={styles.heroSubtitle}>
          共 <Text className="num">{items.length}</Text> 条记录
        </Text>
      </View>

      {/* Primary CTA — 单一强调 */}
      <View className={`${styles.ctaCard} tap-min`} onClick={goApply}>
        <View className={styles.ctaMark}>
          <Text className={`${styles.ctaMarkText} display`}>+</Text>
        </View>
        <View className={styles.ctaText}>
          <Text className={styles.ctaTitle}>申请请假</Text>
          <Text className={styles.ctaHint}>选假别 · 起止 · 原因，一分钟搞定</Text>
        </View>
        <View className={styles.ctaArrow}>
          <Text className={styles.ctaArrowGlyph}>›</Text>
        </View>
      </View>

      {/* 状态过滤 */}
      <ScrollView scrollX className={styles.tabsScroll} showScrollbar={false}>
        <View className={styles.tabs}>
          {STATUS_OPTIONS.map((opt) => (
            <View
              key={opt.value || 'all'}
              className={`${styles.tab} ${status === opt.value ? styles.tabActive : ''}`}
              onClick={() => setStatus(opt.value)}
            >
              <Text className={styles.tabLabel}>{opt.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : items.length === 0 ? (
        <View className={styles.empty}>
          {status ? `暂无${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? ''}的请假` : '还没有请假记录，点上方按钮申请一条'}
        </View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {items.map((r) => {
            const tone = LEAVE_STATUS_TONES[r.status];
            return (
              <View key={r.id} className={styles.card} onClick={() => goDetail(r.id)}>
                <View className={styles.cardHeader}>
                  <Text className={styles.cardTitle}>{r.leave_type_name || '请假'}</Text>
                  <Text className={`${styles.statusPill} ${styles[`tone_${tone}`]}`}>
                    {LEAVE_STATUS_LABELS[r.status]}
                  </Text>
                </View>
                <View className={styles.metaRow}>
                  <Text className={styles.metaText}>
                    <Text className="num">{formatDate(r.start_time)}</Text>
                    <Text className={styles.metaSep}> ~ </Text>
                    <Text className="num">{formatDate(r.end_time)}</Text>
                  </Text>
                  <Text className={styles.duration}>
                    <Text className="num">{r.duration_days}</Text>
                    <Text className={styles.durationUnit}>天</Text>
                  </Text>
                </View>
                {r.reason && (
                  <Text className={styles.reason} numberOfLines={2}>
                    {r.reason}
                  </Text>
                )}

                {/* 操作行 — 仅在状态匹配时出现，避免空 footer */}
                {(r.status === 'pending' || r.status === 'approved') && (
                  <View className={styles.actions}>
                    {r.status === 'pending' && (
                      <View
                        className={`${styles.actionBtn} ${styles.actionWarn} tap-min`}
                        onClick={(e) => { e.stopPropagation(); onWithdraw(r.id); }}
                      >
                        <Text className={styles.actionLabel}>{busyId === r.id ? '处理中…' : '撤回'}</Text>
                      </View>
                    )}
                    {r.status === 'approved' && (
                      <View
                        className={`${styles.actionBtn} ${styles.actionPrimary} tap-min`}
                        onClick={(e) => { e.stopPropagation(); onCancel(r.id); }}
                      >
                        <Text className={styles.actionLabel}>{busyId === r.id ? '处理中…' : '申请销假'}</Text>
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
