import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import { fetchSchedule, type ScheduleClass, type WeekSchedule } from '../../api/schedule';
import styles from './index.module.css';

/* 我的课表 — Apple 玻璃感 × Day archetype。
 *
 * 周日~周一横向 segmented，点击切换日；当日课程以玻璃卡 feed 展示。
 * 当前数据源是 fetchSchedule mock；接真后只需替换 api/schedule.ts 实现。
 */

const DAY_LABELS: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
};

function todayDayOfWeek(): number {
  // JS 0=周日；本应用约定 1=周一 7=周日
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

export default function SchedulePage() {
  const [data, setData] = useState<WeekSchedule | null>(null);
  const [activeDay, setActiveDay] = useState<number>(todayDayOfWeek());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule()
      .then((res) => { if (!cancelled) setData(res); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const todayClasses: ScheduleClass[] = (data?.classes ?? [])
    .filter((c) => c.day_of_week === activeDay)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const dayCounts: Record<number, number> = (() => {
    const acc: Record<number, number> = {};
    for (const c of data?.classes ?? []) {
      acc[c.day_of_week] = (acc[c.day_of_week] ?? 0) + 1;
    }
    return acc;
  })();

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>我的课表</Text>
        <Text className={styles.heroSubtitle}>
          {data ? (
            <>第 <Text className="num">{data.week_index}</Text> 周 · 共 <Text className="num">{data.total_weeks}</Text> 周</>
          ) : (
            '加载中…'
          )}
        </Text>
      </View>

      {/* 周内日切换 */}
      <ScrollView scrollX className={styles.daysScroll} showScrollbar={false}>
        <View className={styles.days}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const count = dayCounts[d] ?? 0;
            const isActive = activeDay === d;
            const isToday = todayDayOfWeek() === d;
            return (
              <View
                key={d}
                className={`${styles.day} ${isActive ? styles.dayActive : ''} tap-min`}
                onClick={() => setActiveDay(d)}
              >
                <Text className={styles.dayLabel}>{DAY_LABELS[d]}</Text>
                <Text className={`${styles.dayCount} num`}>
                  {count > 0 ? `${count} 节` : '休'}
                </Text>
                {isToday && !isActive && <View className={styles.dayTodayDot} />}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : todayClasses.length === 0 ? (
        <View className={styles.empty}>{DAY_LABELS[activeDay]}没有课，可以休息一下</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {todayClasses.map((c) => (
            <View key={c.id} className={`${styles.card} ${styles[`tone_${c.tone}`]}`}>
              <View className={styles.timeCol}>
                <Text className={`${styles.timeStart} num`}>{c.start_time}</Text>
                <View className={styles.timeBar} />
                <Text className={`${styles.timeEnd} num`}>{c.end_time}</Text>
              </View>
              <View className={styles.contentCol}>
                <Text className={styles.courseName}>{c.course_name}</Text>
                <View className={styles.metaRow}>
                  <Text className={styles.metaItem}>{c.location}</Text>
                  <Text className={styles.metaSep}> · </Text>
                  <Text className={styles.metaItem}>{c.teacher}</Text>
                </View>
                <Text className={styles.periodChip}>{c.periods}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View className={styles.footHint}>
        <Text className={styles.footHintText}>课表数据接入中，当前为示例</Text>
      </View>
    </View>
  );
}
