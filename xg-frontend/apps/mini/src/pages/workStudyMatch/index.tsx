import { useMemo, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  findByPreference,
  matchToSchedule,
  type DayCode,
  type FreeSlot,
  type PositionPref,
} from '../../api/workStudy';
import styles from './index.module.css';

type PositionType = '' | 'fixed' | 'temporary';
type Campus = '' | '本部' | '新校区';
type MinRate = '' | '15' | '18' | '20';

interface TimeBand {
  key: 'morning' | 'afternoon' | 'evening';
  label: string;
  start: string;
  end: string;
}

const DAYS: { code: DayCode; label: string }[] = [
  { code: 'mon', label: '周一' },
  { code: 'tue', label: '周二' },
  { code: 'wed', label: '周三' },
  { code: 'thu', label: '周四' },
  { code: 'fri', label: '周五' },
  { code: 'sat', label: '周六' },
  { code: 'sun', label: '周日' },
];

const BANDS: TimeBand[] = [
  { key: 'morning',   label: '上午 8-12',   start: '08:00', end: '12:00' },
  { key: 'afternoon', label: '下午 14-18',  start: '14:00', end: '18:00' },
  { key: 'evening',   label: '晚上 18-22',  start: '18:00', end: '22:00' },
];

/** Cell key like "morning:mon". */
type CellKey = `${TimeBand['key']}:${DayCode}`;

export default function WorkStudyMatch() {
  const [positionType, setPositionType] = useState<PositionType>('');
  const [campus, setCampus] = useState<Campus>('');
  const [minRate, setMinRate] = useState<MinRate>('');
  const [keyword, setKeyword] = useState('');
  const [picked, setPicked] = useState<Set<CellKey>>(new Set());
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const slots: FreeSlot[] = useMemo(() => {
    const out: FreeSlot[] = [];
    for (const b of BANDS) {
      for (const d of DAYS) {
        const k: CellKey = `${b.key}:${d.code}`;
        if (picked.has(k)) out.push({ day: d.code, start: b.start, end: b.end });
      }
    }
    return out;
  }, [picked]);

  const togglePicked = (k: CellKey) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const buildPref = (): PositionPref => {
    const pref: PositionPref = {};
    if (positionType) pref.position_type = positionType;
    if (campus) pref.campus = campus;
    if (minRate) pref.min_rate = Number(minRate);
    const k = keyword.trim();
    if (k) pref.keyword = k;
    return pref;
  };

  const runMatch = async () => {
    if (slots.length === 0) {
      Taro.showToast({ title: '先点选有空的时段', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const text = await matchToSchedule(slots);
      setOutput(text);
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || 'AI 调用失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const runFind = async () => {
    setLoading(true);
    try {
      const text = await findByPreference(buildPref());
      setOutput(text);
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || 'AI 调用失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  // The AI tool prefixes each result row with "- #<id> <title>...".
  // Render those as tappable lines to the detail page; keep other lines as text.
  const lines = (output || '').split('\n');

  const goDetail = (raw: string) => {
    // Match "- #<id> ..." to extract numeric id.
    const m = raw.match(/^[-•]?\s*#(\d+)/);
    if (!m) return;
    Taro.navigateTo({ url: `/pages/workStudyDetail/index?id=${m[1]}` });
  };

  return (
    <ScrollView scrollY className={styles.page}>
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>我的偏好</Text>
        <Text className={styles.sectionHint}>不选就是不限</Text>

        <View className={styles.row}>
          <Text className={styles.rowLabel}>类型</Text>
          {(['', 'fixed', 'temporary'] as PositionType[]).map((v) => (
            <Text
              key={v || 'any'}
              className={`${styles.chip} ${positionType === v ? styles.chipActive : ''}`}
              onClick={() => setPositionType(v)}
            >
              {v === '' ? '全部' : v === 'fixed' ? '固定岗' : '临时岗'}
            </Text>
          ))}
        </View>

        <View className={styles.row}>
          <Text className={styles.rowLabel}>校区</Text>
          {(['', '本部', '新校区'] as Campus[]).map((v) => (
            <Text
              key={v || 'any'}
              className={`${styles.chip} ${campus === v ? styles.chipActive : ''}`}
              onClick={() => setCampus(v)}
            >
              {v === '' ? '全部' : v}
            </Text>
          ))}
        </View>

        <View className={styles.row}>
          <Text className={styles.rowLabel}>薪资</Text>
          {(['', '15', '18', '20'] as MinRate[]).map((v) => (
            <Text
              key={v || 'any'}
              className={`${styles.chip} ${minRate === v ? styles.chipActive : ''}`}
              onClick={() => setMinRate(v)}
            >
              {v === '' ? '不限' : `≥¥${v}`}
            </Text>
          ))}
        </View>

        <View className={styles.row}>
          <Text className={styles.rowLabel}>关键词</Text>
          <Input
            className={styles.kwInput}
            placeholder="例：图书馆 / 食堂（可不填）"
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            maxlength={30}
          />
        </View>
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>我的空闲时段</Text>
        <Text className={styles.sectionHint}>点选哪天哪段有空，可多选</Text>

        {BANDS.map((b) => (
          <View key={b.key} className={styles.bandBlock}>
            <Text className={styles.bandLabel}>{b.label}</Text>
            <View className={styles.bandRow}>
              {DAYS.map((d) => {
                const k: CellKey = `${b.key}:${d.code}`;
                const active = picked.has(k);
                return (
                  <Text
                    key={k}
                    className={`${styles.dayCell} ${active ? styles.dayCellActive : ''}`}
                    onClick={() => togglePicked(k)}
                  >
                    {d.label.slice(1)}
                  </Text>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View className={styles.actions}>
        <Text
          className={`${styles.actionBtn} ${slots.length === 0 ? styles.actionBtnDisabled : ''}`}
          onClick={runMatch}
        >
          按时间匹配 ({slots.length})
        </Text>
        <Text
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={runFind}
        >
          按偏好筛
        </Text>
      </View>

      {loading && <View className={styles.loading}>AI 分析中…</View>}

      {output && !loading && (
        <View className={styles.resultSection}>
          <Text className={styles.sectionTitle}>AI 推荐</Text>
          {lines.map((ln, i) => {
            const linkable = /^[-•]?\s*#\d+/.test(ln);
            return (
              <Text
                key={i}
                className={`${styles.resultLine} ${linkable ? styles.resultLineLink : ''}`}
                onClick={linkable ? () => goDetail(ln) : undefined}
              >
                {ln || ' '}
              </Text>
            );
          })}
        </View>
      )}

      {!output && !loading && (
        <View className={styles.emptyTip}>选好后点上面按钮</View>
      )}
    </ScrollView>
  );
}
