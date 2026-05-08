import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  listMyApplications,
  listMySalaries,
  type MiniApplication,
  type MiniSalary,
} from '../../api/workStudy';
import styles from './index.module.css';

/* 我的勤工 — Apple 玻璃感 × Feed archetype。
 * 双 tab: 申请 / 薪资。URL ?tab=apps|salary 控制初始 tab。
 */

type TabKey = 'apps' | 'salary';

const APP_STATUS_LABEL: Record<string, string> = {
  pending: '审批中',
  recommended: '已推荐',
  hired: '已录用',
  rejected: '未通过',
};
const APP_STATUS_TONE: Record<string, 'pending' | 'ok' | 'warn' | 'danger' | 'muted'> = {
  pending: 'pending',
  recommended: 'warn',
  hired: 'ok',
  rejected: 'danger',
};

const SALARY_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '审批中',
  confirmed: '已确认',
  rejected: '已驳回',
  paid: '已支付',
};
const SALARY_STATUS_TONE: Record<string, 'pending' | 'ok' | 'warn' | 'danger' | 'muted'> = {
  draft: 'muted',
  pending: 'pending',
  confirmed: 'warn',     // 已确认但未发放，用 warn 更突出"待发放"
  rejected: 'danger',
  paid: 'ok',
};

const UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

interface MonthGroup {
  month: string;
  total: number;
  rows: MiniSalary[];
}

function groupSalariesByMonth(rows: MiniSalary[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const s of rows) {
    if (!map.has(s.month)) map.set(s.month, { month: s.month, total: 0, rows: [] });
    const g = map.get(s.month)!;
    g.rows.push(s);
    if (s.status === 'confirmed' || s.status === 'paid') {
      g.total += Number(s.amount) || 0;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
}

export default function MyWorkStudyPage() {
  const router = useRouter();
  const initialTab: TabKey = router.params.tab === 'salary' ? 'salary' : 'apps';
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [apps, setApps] = useState<MiniApplication[]>([]);
  const [salaries, setSalaries] = useState<MiniSalary[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingSalary, setLoadingSalary] = useState(true);

  const load = useCallback(async () => {
    const userId = String(Taro.getStorageSync('userId') || '');
    if (!userId) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setLoadingApps(true);
    setLoadingSalary(true);
    // 两条并发，互不阻塞
    listMyApplications(userId, 1, 100)
      .then((r) => setApps(r.data ?? []))
      .catch((e: Error) => Taro.showToast({ title: e.message, icon: 'none' }))
      .finally(() => setLoadingApps(false));
    listMySalaries(userId, 1, 100)
      .then((r) => setSalaries(r.data ?? []))
      .catch((e: Error) => Taro.showToast({ title: e.message, icon: 'none' }))
      .finally(() => setLoadingSalary(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useDidShow(() => { load(); });

  const settledTotal = salaries
    .filter((s) => s.status === 'confirmed' || s.status === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const groups = groupSalariesByMonth(salaries);

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>我的勤工</Text>
        <Text className={styles.heroSubtitle}>
          {tab === 'apps'
            ? <>共 <Text className="num">{apps.length}</Text> 份申请</>
            : <>累计应得 <Text className="num">¥{settledTotal.toFixed(2)}</Text></>}
        </Text>
      </View>

      {/* Segmented tabs */}
      <View className={styles.tabsWrap}>
        <View className={styles.tabs}>
          <View
            className={`${styles.tab} ${tab === 'apps' ? styles.tabActive : ''} tap-min`}
            onClick={() => setTab('apps')}
          >
            <Text className={styles.tabLabel}>申请</Text>
          </View>
          <View
            className={`${styles.tab} ${tab === 'salary' ? styles.tabActive : ''} tap-min`}
            onClick={() => setTab('salary')}
          >
            <Text className={styles.tabLabel}>薪资</Text>
          </View>
        </View>
      </View>

      {tab === 'apps' ? (
        <ApplicationsList
          apps={apps}
          loading={loadingApps}
        />
      ) : (
        <SalariesList groups={groups} loading={loadingSalary} />
      )}
    </View>
  );
}

function ApplicationsList({ apps, loading }: { apps: MiniApplication[]; loading: boolean }) {
  if (loading) return <View className={styles.empty}>加载中…</View>;
  if (apps.length === 0) {
    return (
      <View className={styles.emptyAction}>
        <Text className={styles.empty}>还没有申请记录</Text>
        <View
          className={`${styles.ctaBtn} tap-min`}
          onClick={() => Taro.navigateTo({ url: '/pages/workStudy/index' })}
        >
          <Text className={styles.ctaBtnLabel}>看看在招岗位</Text>
        </View>
      </View>
    );
  }
  return (
    <ScrollView scrollY className={styles.list}>
      {apps.map((a) => {
        const tone = APP_STATUS_TONE[a.status] ?? 'muted';
        return (
          <View
            key={a.id}
            className={styles.card}
            onClick={() => Taro.navigateTo({ url: `/pages/workStudyDetail/index?id=${a.position_id}` })}
          >
            <View className={styles.cardHeader}>
              <Text className={styles.cardTitle}>
                {a.position_summary?.title || `岗位 #${a.position_id}`}
              </Text>
              <Text className={`${styles.statusPill} ${styles[`tone_${tone}`]}`}>
                {APP_STATUS_LABEL[a.status] ?? a.status}
              </Text>
            </View>
            {a.intro && (
              <Text className={styles.intro} numberOfLines={2}>{a.intro}</Text>
            )}
            <Text className={styles.timestamp}>
              提交于 <Text className="num">{a.created_at?.slice(0, 10) ?? '—'}</Text>
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function SalariesList({ groups, loading }: { groups: MonthGroup[]; loading: boolean }) {
  if (loading) return <View className={styles.empty}>加载中…</View>;
  if (groups.length === 0) return <View className={styles.empty}>暂无薪资记录</View>;
  return (
    <ScrollView scrollY className={styles.list}>
      {groups.map((g) => (
        <View key={g.month} className={styles.monthGroup}>
          <View className={styles.monthHeader}>
            <Text className={styles.monthLabel}>{g.month}</Text>
            <Text className={`${styles.monthTotal} num`}>¥{g.total.toFixed(2)}</Text>
          </View>
          {g.rows.map((s) => {
            const tone = SALARY_STATUS_TONE[s.status] ?? 'muted';
            const detail = s.units && s.unit_type
              ? `${Number(s.units).toFixed(1)} ${UNIT_LABEL[s.unit_type] ?? s.unit_type} × ¥${s.unit_rate ? Number(s.unit_rate).toFixed(2) : '?'}`
              : s.hours
                ? `${Number(s.hours).toFixed(1)} 小时 × ¥${s.hourly_rate ? Number(s.hourly_rate).toFixed(2) : '?'}`
                : '—';
            return (
              <View key={s.id} className={styles.salaryCard}>
                <View className={styles.cardHeader}>
                  <View className={styles.amountWrap}>
                    <Text className={`${styles.amount} num`}>¥{Number(s.amount).toFixed(2)}</Text>
                    <Text className={styles.amountSub}>
                      {s.position_summary?.title ?? `岗位 #${s.position_id}`}
                    </Text>
                  </View>
                  <Text className={`${styles.statusPill} ${styles[`tone_${tone}`]}`}>
                    {SALARY_STATUS_LABEL[s.status] ?? s.status}
                  </Text>
                </View>
                <Text className={styles.detail}>{detail}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
