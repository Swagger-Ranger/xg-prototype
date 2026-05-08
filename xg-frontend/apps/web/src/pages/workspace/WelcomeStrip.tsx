import { useQuery } from '@tanstack/react-query';
import { getCurrentTerm } from '@/api/academic';
import { getCurrentWeather } from '@/api/weather';
import AssistantAvatar, { useAssistantPersona } from '@/components/brand/AssistantAvatar';
import styles from './WelcomeStrip.module.css';

interface Props {
  studentName?: string | null;
}

/** Coarse time-of-day → greeting word, in Chinese. */
function timeGreeting(hour: number): string {
  if (hour < 6) return '夜深了，';
  if (hour < 11) return '早上好，';
  if (hour < 13) return '中午好，';
  if (hour < 17) return '下午好，';
  if (hour < 20) return '傍晚好，';
  return '晚上好，';
}

/** Map persona period + hour to the strip's tinted background variant. */
function stripTone(period: 'day' | 'night', hour: number): 'day' | 'dusk' | 'night' {
  if (period === 'night') return 'night';
  if (hour >= 16) return 'dusk';
  return 'day';
}

const PHASE_LABELS: Record<string, string> = {
  pre_term: '学期未开始',
  teaching: '教学中',
  holiday: '假期中',
  exam: '考试周',
  post_term: '学期结束',
};

/**
 * Top-of-dashboard greeting for students. Shows persona icon, time-of-day
 * greeting + name, current week + countdown to next exam / term end, and
 * (optionally) a one-line weather summary pulled from the school's
 * configured city. Each piece degrades gracefully — students with no term
 * configured still see a clean greeting.
 */
export default function WelcomeStrip({ studentName }: Props) {
  const persona = useAssistantPersona();
  const hour = new Date().getHours();
  const tone = stripTone(persona.period, hour);

  const { data: term } = useQuery({
    queryKey: ['currentTermView'],
    queryFn: getCurrentTerm,
    staleTime: 5 * 60 * 1000,
  });

  const { data: weather } = useQuery({
    queryKey: ['weatherCurrent'],
    queryFn: () => getCurrentWeather(),
    staleTime: 30 * 60 * 1000,    // weather doesn't move that fast
    refetchOnWindowFocus: false,
  });

  // Build the meta line piece by piece — skip parts that don't apply.
  const metaParts: { key: string; node: React.ReactNode }[] = [];
  if (term) {
    if (term.phase === 'teaching') {
      metaParts.push({
        key: 'week',
        node: <span className={styles.metaItem}>第 <em>{term.current_week}</em> 周 / 共 {term.effective_total_weeks} 周</span>,
      });
    } else if (PHASE_LABELS[term.phase]) {
      metaParts.push({
        key: 'phase',
        node: (
          <span className={`${styles.phaseTag} ${term.phase === 'exam' ? styles.exam : term.phase === 'holiday' ? styles.holiday : ''}`}>
            {PHASE_LABELS[term.phase]}
          </span>
        ),
      });
    }
    if (term.days_to_exam !== null && term.days_to_exam > 0 && term.phase !== 'exam') {
      metaParts.push({
        key: 'exam',
        node: <span className={styles.metaItem}>距期末考 <em>{term.days_to_exam}</em> 天</span>,
      });
    } else if (term.days_to_term_end > 0 && term.phase === 'teaching') {
      metaParts.push({
        key: 'end',
        node: <span className={styles.metaItem}>距学期结束 <em>{term.days_to_term_end}</em> 天</span>,
      });
    }
  }

  return (
    <div className={`${styles.strip} ${styles[tone]}`}>
      <div className={styles.persona}>
        <AssistantAvatar />
      </div>
      <div className={styles.body}>
        <div className={styles.greeting}>
          {timeGreeting(hour)}
          {studentName || '同学'}
        </div>
        {(metaParts.length > 0 || weather?.summary) && (
          <div className={styles.meta}>
            {metaParts.map((p, i) => (
              <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span className={styles.metaSep}>·</span>}
                {p.node}
              </span>
            ))}
            {weather?.summary && (
              <>
                {metaParts.length > 0 && <span className={styles.metaSep}>·</span>}
                <span className={styles.weather}>{weather.summary}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
