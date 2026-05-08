import { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Spin } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  getMyPreference,
  upsertMyPreference,
  type CourseSchedule,
  type DayCode,
  type PeriodCode,
  type PositionPref,
} from '@/api/workStudy';
import styles from './PreferenceTab.module.css';

/**
 * 5 段（钟点制）。p1 = 8-10 / p2 = 10-12 / p3 = 14-16 / p4 = 16-18 / p5 = 19-21
 * 与后端 student_workstudy_preference.course_schedule 的 enum 一一对应。
 * 选钟点而非"X-Y节"是因为不同学校节次起止时间不同，钟点学校无关。
 */
const PERIODS: { code: PeriodCode; label: string; range: string }[] = [
  { code: 'p1', label: '上午早段', range: '8:00 - 10:00' },
  { code: 'p2', label: '上午晚段', range: '10:00 - 12:00' },
  { code: 'p3', label: '下午早段', range: '14:00 - 16:00' },
  { code: 'p4', label: '下午晚段', range: '16:00 - 18:00' },
  { code: 'p5', label: '晚自习',   range: '19:00 - 21:00' },
];

const DAYS: { code: DayCode; label: string; weekend?: boolean }[] = [
  { code: 'mon', label: '周一' },
  { code: 'tue', label: '周二' },
  { code: 'wed', label: '周三' },
  { code: 'thu', label: '周四' },
  { code: 'fri', label: '周五' },
  { code: 'sat', label: '周六', weekend: true },
  { code: 'sun', label: '周日', weekend: true },
];

const TYPE_OPTIONS: { code: 'fixed' | 'temporary'; label: string }[] = [
  { code: 'fixed', label: '固定岗' },
  { code: 'temporary', label: '临时岗' },
];

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** 课表里 day → set(period) 的轻包装，便于 O(1) 切换。 */
function isBusy(s: CourseSchedule, day: DayCode, period: PeriodCode): boolean {
  return (s[day] ?? []).includes(period);
}

function toggle(s: CourseSchedule, day: DayCode, period: PeriodCode): CourseSchedule {
  const cur = s[day] ?? [];
  const next = cur.includes(period) ? cur.filter((p) => p !== period) : [...cur, period];
  return { ...s, [day]: next };
}

export default function PreferenceTab() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ws-my-preference'],
    queryFn: getMyPreference,
  });

  const [schedule, setSchedule] = useState<CourseSchedule>({});
  const [pref, setPref] = useState<PositionPref>({});

  // Sync server state into local form once it arrives. Re-parsed every time
  // the query result changes, so a successful save (which invalidates &
  // refetches) keeps local state aligned with server.
  useEffect(() => {
    if (!query.data) return;
    setSchedule(safeParse<CourseSchedule>(query.data.course_schedule, {}));
    setPref(safeParse<PositionPref>(query.data.position_pref, {}));
  }, [query.data]);

  const saveMut = useMutation({
    mutationFn: upsertMyPreference,
    onSuccess: () => {
      message.success('已保存，找岗位时会按这个偏好匹配');
      qc.invalidateQueries({ queryKey: ['ws-my-preference'] });
    },
    onError: (e) => message.error(describeApiError(e, '保存失败')),
  });

  const busyCount = useMemo(() => {
    return Object.values(schedule).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
  }, [schedule]);

  const handleSave = () => {
    saveMut.mutate({
      course_schedule: JSON.stringify(schedule),
      position_pref: JSON.stringify(pref),
    });
  };

  const handleClearAll = () => setSchedule({});
  const handleWeekdayMornings = () => {
    const next: CourseSchedule = {};
    (['mon', 'tue', 'wed', 'thu', 'fri'] as DayCode[]).forEach((d) => {
      next[d] = ['p1', 'p2'];
    });
    setSchedule(next);
  };
  const handleWeekdayAllDay = () => {
    const next: CourseSchedule = {};
    (['mon', 'tue', 'wed', 'thu', 'fri'] as DayCode[]).forEach((d) => {
      next[d] = ['p1', 'p2', 'p3', 'p4', 'p5'];
    });
    setSchedule(next);
  };

  const toggleType = (t: 'fixed' | 'temporary') => {
    const cur = pref.types ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    setPref({ ...pref, types: next.length ? next : undefined });
  };

  if (query.isLoading) {
    return <div className={styles.loading}><Spin /></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        勾选每周<strong>有课</strong>的时段，剩下的就是你能勤工的空闲。
        AI 找岗位会根据空闲 + 偏好为你筛。
      </div>

      <div className={styles.sectionLabel}>
        <span>SCHEDULE · 我的课表</span>
        <div className={styles.sectionLine} />
        <span className={styles.busyCount}>
          {busyCount === 0 ? '默认：整周空闲' : `已标 ${busyCount} 个有课时段`}
        </span>
      </div>

      <div className={styles.shortcuts}>
        <Button size="small" onClick={handleClearAll}>清空整周</Button>
        <Button size="small" onClick={handleWeekdayMornings}>工作日上午有课</Button>
        <Button size="small" onClick={handleWeekdayAllDay}>工作日全天有课</Button>
      </div>

      <div className={styles.gridCard}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th className={styles.cornerCell} />
              {DAYS.map((d) => (
                <th key={d.code} className={`${styles.dayHead} ${d.weekend ? styles.weekend : ''}`}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.code}>
                <th className={styles.periodHead}>
                  <span className={styles.periodRange}>{p.range}</span>
                  <span className={styles.periodLabel}>{p.label}</span>
                </th>
                {DAYS.map((d) => {
                  const busy = isBusy(schedule, d.code, p.code);
                  return (
                    <td key={d.code} className={styles.cellWrap}>
                      <button
                        type="button"
                        className={`${styles.cell} ${busy ? styles.busy : styles.free}`}
                        onClick={() => setSchedule((s) => toggle(s, d.code, p.code))}
                        aria-pressed={busy}
                        aria-label={`${d.label} ${p.range} ${busy ? '有课，点击取消' : '空闲，点击标为有课'}`}
                      >
                        {busy ? '有课' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.legend}>
          <span><span className={`${styles.legendDot} ${styles.free}`} />空闲（默认）</span>
          <span><span className={`${styles.legendDot} ${styles.busy}`} />有课</span>
        </div>
      </div>

      <div className={styles.sectionLabel}>
        <span>PREFERENCE · 岗位偏好</span>
        <div className={styles.sectionLine} />
      </div>

      <div className={styles.prefCard}>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>岗位类型</div>
          <div className={styles.chipsRow}>
            {TYPE_OPTIONS.map((t) => {
              const active = (pref.types ?? []).includes(t.code);
              return (
                <button
                  type="button"
                  key={t.code}
                  className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                  onClick={() => toggleType(t.code)}
                >
                  {t.label}
                </button>
              );
            })}
            <span className={styles.fieldHint}>不选 = 不限</span>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>校区</div>
          <Input
            value={pref.campus ?? ''}
            onChange={(e) => setPref({ ...pref, campus: e.target.value || undefined })}
            placeholder="如：本部 / 东校区，留空=不限"
            maxLength={64}
            style={{ maxWidth: 280 }}
            allowClear
          />
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>时薪范围（元/小时）</div>
          <div className={styles.rateRow}>
            <InputNumber
              min={0}
              precision={2}
              value={pref.rate_min ?? null}
              onChange={(v) => setPref({ ...pref, rate_min: v == null ? undefined : Number(v) })}
              placeholder="最低"
              style={{ width: 120 }}
            />
            <span className={styles.rateSep}>~</span>
            <InputNumber
              min={0}
              precision={2}
              value={pref.rate_max ?? null}
              onChange={(v) => setPref({ ...pref, rate_max: v == null ? undefined : Number(v) })}
              placeholder="最高"
              style={{ width: 120 }}
            />
            <span className={styles.fieldHint}>留空=不限</span>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>关键词</div>
          <Input
            value={pref.keywords ?? ''}
            onChange={(e) => setPref({ ...pref, keywords: e.target.value || undefined })}
            placeholder="如：图书馆 实验室 答疑"
            maxLength={128}
            style={{ maxWidth: 480 }}
            allowClear
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          type="primary"
          loading={saveMut.isPending}
          onClick={handleSave}
        >
          保存偏好
        </Button>
        <span className={styles.savedAt}>
          {query.data?.updated_at
            ? `上次保存于 ${new Date(query.data.updated_at).toLocaleString('zh-CN')}`
            : '尚未保存过'}
        </span>
      </div>
    </div>
  );
}
