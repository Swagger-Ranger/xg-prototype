import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { listMySalaries, type MiniSalary } from '../../api/workStudy';
import styles from './index.module.css';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '审批中',
  confirmed: '已确认',
  rejected: '已驳回',
  paid: '已支付',
};

const STATUS_CLASS: Record<string, string> = {
  draft: styles.statusDraft,
  pending: styles.statusPending,
  confirmed: styles.statusConfirmed,
  rejected: styles.statusRejected,
  paid: styles.statusPaid,
};

const UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

interface MonthGroup {
  month: string;
  total: number;       // 已确认 + 已支付（学生实际预期到手）
  rows: MiniSalary[];
}

export default function MySalaries() {
  const [salaries, setSalaries] = useState<MiniSalary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = String(Taro.getStorageSync('userId') || '');
    if (!userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    listMySalaries(userId, 1, 100)
      .then((res) => setSalaries(res.data ?? []))
      .catch((err: Error) => Taro.showToast({ title: err.message, icon: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  // Top KPIs
  const settledTotal = salaries
    .filter((s) => s.status === 'confirmed' || s.status === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const pendingCount = salaries.filter((s) => s.status === 'pending').length;
  const paidCount = salaries.filter((s) => s.status === 'paid').length;

  // Group by month, newest first
  const groups: MonthGroup[] = (() => {
    const byMonth = new Map<string, MonthGroup>();
    for (const s of salaries) {
      if (!byMonth.has(s.month)) byMonth.set(s.month, { month: s.month, total: 0, rows: [] });
      const g = byMonth.get(s.month)!;
      g.rows.push(s);
      if (s.status === 'confirmed' || s.status === 'paid') {
        g.total += Number(s.amount) || 0;
      }
    }
    return Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
  })();

  return (
    <View className={styles.page}>
      <View className={styles.summaryCard}>
        <Text className={styles.summaryLabel}>累计应得（已确认 + 已支付）</Text>
        <Text className={styles.summaryValue}>¥{settledTotal.toFixed(2)}</Text>
        <View className={styles.summaryMeta}>
          <Text>审批中 {pendingCount} 条</Text>
          <Text>已支付 {paidCount} 条</Text>
        </View>
      </View>

      {loading ? (
        <View className={styles.loading}>加载中…</View>
      ) : salaries.length === 0 ? (
        <View className={styles.empty}>暂无薪资记录</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {groups.map((g) => (
            <View key={g.month} className={styles.monthGroup}>
              <View className={styles.monthHeader}>
                <Text>{g.month}</Text>
                <Text className={styles.monthTotal}>¥{g.total.toFixed(2)}</Text>
              </View>
              {g.rows.map((s) => (
                <View key={s.id} className={styles.card}>
                  <View className={styles.cardRow}>
                    <View>
                      <Text className={styles.amount}>¥{Number(s.amount).toFixed(2)}</Text>
                      <Text className={styles.amountLabel}>
                        {' '}（{s.position_summary?.title || `岗位 #${s.position_id}`}）
                      </Text>
                    </View>
                    <Text className={`${styles.statusTag} ${STATUS_CLASS[s.status] || ''}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </Text>
                  </View>
                  <Text className={styles.detail}>
                    {s.units && s.unit_type
                      ? `${Number(s.units).toFixed(1)} ${UNIT_LABEL[s.unit_type] ?? s.unit_type} × ¥${s.unit_rate ? Number(s.unit_rate).toFixed(2) : '?'}`
                      : s.hours
                      ? `${Number(s.hours).toFixed(1)} 小时 × ¥${s.hourly_rate ? Number(s.hourly_rate).toFixed(2) : '?'}`
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
