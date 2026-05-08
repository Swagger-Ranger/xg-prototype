import type { CurrentTermView } from '@/api/academic';

interface Props {
  term: CurrentTermView | null | undefined;
}

/**
 * Compact SVG progress ring for the student dashboard's stats row. Shows
 * "current week / total weeks" with a colored arc representing how much of
 * the teaching weeks have elapsed. Pre-term / post-term degrade to a flat
 * label.
 */
export default function SemesterProgressRing({ term }: Props) {
  if (!term) {
    return (
      <div style={{ color: 'var(--fg-4)', fontSize: 13 }}>未配置学期</div>
    );
  }

  const total = term.effective_total_weeks || 1;
  const current = term.current_week ?? 0;
  const ratio = Math.max(0, Math.min(1, current / total));

  // Tone shifts as the term progresses — chill green early, amber mid, red late.
  const arcColor =
    term.phase === 'exam' ? '#dc2626' :
    term.phase === 'post_term' ? '#94a3b8' :
    ratio < 0.5 ? '#059669' :
    ratio < 0.85 ? '#b45309' :
    '#dc2626';

  // Geometry
  const size = 56;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  const phaseLabel =
    term.phase === 'pre_term' ? '未开始' :
    term.phase === 'post_term' ? '已结束' :
    term.phase === 'exam' ? '考试周' :
    term.phase === 'holiday' ? '假期' :
    null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bd-2)"
          strokeWidth={stroke}
        />
        {/* Progress arc — start at 12 o'clock, sweep clockwise */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="14"
          fontWeight="600"
          fill="var(--fg)"
          fontFamily="var(--font-mono)"
        >
          {phaseLabel ? '—' : current}
        </text>
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          学期进度
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--fg)', marginTop: 2 }}>
          {phaseLabel ? phaseLabel : <>第 <strong>{current}</strong> 周 / 共 {total} 周</>}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
          {term.code}
        </div>
      </div>
    </div>
  );
}
