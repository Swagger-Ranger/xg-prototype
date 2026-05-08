import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import styles from './TodayBriefCard.module.css';

export type BriefTone = 'normal' | 'warn' | 'danger' | 'success';

export interface BriefSegment {
  text?: string;
  value?: string | number;
  tone?: BriefTone;
}

export interface BriefItem {
  icon: ReactNode;
  tone?: BriefTone;
  segments: BriefSegment[];
  trail?: string;
  href?: string;
}

export interface BriefStat {
  label: string;
  value: string | number;
  footer?: string;
  icon?: ReactNode;
  href?: string;
  spark?: number[];
  critical?: boolean;
}

export interface ClassBrief {
  classId: number | null;
  className: string;
  total: number;
  onLeave: number;
  /** students currently on leave today/tomorrow, shown inline */
  absentees: Array<{ name: string; days: number }>;
}

interface TodayBriefCardProps {
  title?: string;
  greet?: string;
  summary?: ReactNode;
  stats?: BriefStat[];
  classes?: ClassBrief[];
  onClassAi?: (c: ClassBrief) => void;
  items: BriefItem[];
  emptyText?: string;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function hourGreet(): string {
  const h = dayjs().hour();
  if (h < 6) return '凌晨好';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function TodayBriefCard({
  title = '今日简报',
  greet,
  summary,
  stats,
  classes,
  onClassAi,
  items,
  emptyText = '今日无紧急事项，保持节奏。',
}: TodayBriefCardProps) {
  const navigate = useNavigate();
  const now = dayjs();
  const dateLabel = `${now.format('YYYY-MM-DD')} 周${WEEKDAY_LABELS[now.day()]}`;
  const greeting = greet ?? hourGreet();

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.date}>{dateLabel}</span>
        <span className={styles.greet}>{greeting}</span>
      </div>

      {summary && <div className={styles.summary}>{summary}</div>}

      {stats && stats.length > 0 && (
        <div className={styles.stats}>
          {stats.map((s) => {
            const linkable = !!s.href;
            return (
              <div
                key={s.label}
                className={`${styles.stat} ${linkable ? styles.statLink : ''}`}
                onClick={linkable ? () => navigate(s.href!) : undefined}
              >
                <div className={styles.statHead}>
                  <span className={styles.statLabel}>{s.label}</span>
                  {s.icon && <span className={styles.statIcon}>{s.icon}</span>}
                </div>
                <div
                  className={`${styles.statValue} ${s.critical ? styles.statValueCritical : ''}`}
                >
                  {s.value}
                </div>
                <div className={styles.statFooter}>
                  {s.footer && <span>{s.footer}</span>}
                  {s.spark && s.spark.length > 0 && (
                    <div className={styles.spark}>
                      {s.spark.map((h, i) => (
                        <span key={i} style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {classes && classes.length > 0 && (
        <div className={styles.classes}>
          <span className={styles.classesTitle}>班级</span>
          <div className={styles.classChipRow}>
            {classes.map((c) => {
              const inClass = Math.max(0, c.total - c.onLeave);
              const clickable = c.classId != null && !!onClassAi;
              const tip = c.onLeave === 0
                ? `${c.className} · 全员在校${clickable ? ' · 点击 AI 分析' : ''}`
                : `${c.className} · ${c.onLeave} 人不在校：${c.absentees.map((a) => `${a.name}(${a.days}天)`).join('、')}${clickable ? ' · 点击 AI 分析' : ''}`;
              return (
                <Tooltip key={c.className} title={tip} mouseEnterDelay={0.2}>
                  <span
                    className={`${styles.classChip} ${c.onLeave > 0 ? styles.classChipWarn : ''} ${clickable ? styles.classChipClickable : ''}`}
                    onClick={clickable ? () => onClassAi!(c) : undefined}
                  >
                    <span className={styles.classChipName}>{c.className}</span>
                    <span className={styles.classChipRatio}>
                      <em>{inClass}</em>/{c.total}
                    </span>
                    {c.onLeave > 0 && (
                      <span className={styles.classChipBadge}>⚠{c.onLeave}</span>
                    )}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className={styles.empty}>{emptyText}</div>
      ) : (
        <div className={styles.list}>
          {items.map((it, i) => {
            const linkable = !!it.href;
            const cls = `${styles.item} ${linkable ? styles.itemLink : ''}`;
            const iconTone = it.tone ? styles[`icon_${it.tone}`] ?? '' : '';
            return (
              <div
                key={i}
                className={cls}
                onClick={linkable ? () => navigate(it.href!) : undefined}
              >
                <span className={`${styles.icon} ${iconTone}`}>{it.icon}</span>
                <span className={styles.text}>
                  {it.segments.map((seg, j) => {
                    if (seg.value === undefined || seg.value === null || seg.value === '') {
                      return <span key={j}>{seg.text}</span>;
                    }
                    const numTone = seg.tone ? styles[`num_${seg.tone}`] ?? '' : '';
                    return (
                      <span key={j}>
                        {seg.text}
                        <span className={`${styles.num} ${numTone}`}>{seg.value}</span>
                      </span>
                    );
                  })}
                </span>
                {it.trail && <span className={styles.trail}>{it.trail}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
