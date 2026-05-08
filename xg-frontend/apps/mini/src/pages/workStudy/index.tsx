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
      {/* ── Hero header ─────────────────────────────────────────
          serif page title + atmospheric subline. The number is wrapped in
          .num so it reads as data-not-prose at a glance. */}
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>勤工助学</Text>
        <Text className={styles.heroSubtitle}>
          在招 <Text className="num">{total}</Text> 个岗位 · 等你来挑
        </Text>
      </View>

      {/* ── Primary CTA ─────────────────────────────────────────
          The page's single bold accent. Solid --ac fill + serif "AI"
          mark on the left + arrow on the right. Designed to be the
          obvious next step on first load. */}
      <View
        className={`${styles.ctaCard} tap-min`}
        onClick={() => Taro.navigateTo({ url: '/pages/workStudyMatch/index' })}
      >
        <View className={styles.ctaMark}>
          <Text className={`${styles.ctaMarkText} display`}>AI</Text>
        </View>
        <View className={styles.ctaText}>
          <Text className={styles.ctaTitle}>帮我找最匹配的岗位</Text>
          <Text className={styles.ctaHint}>选空闲时段 + 偏好，自动推荐</Text>
        </View>
        <View className={styles.ctaArrow}>
          <Text className={styles.ctaArrowGlyph}>›</Text>
        </View>
      </View>

      {/* ── List section ───────────────────────────────────────── */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionLabel}>全部在招</Text>
        <View className={styles.sectionLine} />
      </View>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : positions.length === 0 ? (
        <View className={styles.empty}>暂无符合你条件的岗位</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {positions.map((p) => {
            const isTemp = p.position_type === 'temporary';
            const salaryAmount = p.salary_amount || p.hourly_rate;
            return (
              <View key={p.id} className={styles.card} onClick={() => goDetail(p.id)}>
                <View className={styles.cardHeader}>
                  <Text className={styles.cardTitle}>{p.title}</Text>
                  <Text className={`${styles.typeBadge} ${isTemp ? styles.typeBadgeTemp : ''}`}>
                    {isTemp ? '临时岗' : '固定岗'}
                  </Text>
                </View>

                {/* Meta line — neutral gray, dot-separated. Falsy fields
                    are filtered so we never trail empty separators. */}
                <View className={styles.meta}>
                  {[
                    p.department_name,
                    p.campus,
                    p.weekly_hours ? `周 ${p.weekly_hours} 小时` : null,
                  ]
                    .filter(Boolean)
                    .map((label, i, arr) => (
                      <Text key={i} className={styles.metaItem}>
                        {label}
                        {i < arr.length - 1 && <Text className={styles.metaSep}> · </Text>}
                      </Text>
                    ))}
                </View>

                <View className={styles.foot}>
                  {salaryAmount ? (
                    <Text className={styles.salary}>
                      <Text className="num">¥{Number(salaryAmount).toFixed(2)}</Text>
                      <Text className={styles.salaryUnit}>
                        /{SALARY_UNIT_LABEL[p.salary_unit || 'hour'] || '时'}
                      </Text>
                    </Text>
                  ) : (
                    <Text className={styles.salaryEmpty}>面议</Text>
                  )}
                  <Text className={styles.headcount}>
                    招&nbsp;
                    <Text className="num">{p.hired_count ?? 0}/{p.headcount ?? '?'}</Text>
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
