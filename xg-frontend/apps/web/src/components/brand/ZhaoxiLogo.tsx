import { useId } from 'react';

interface Props {
  /** Pixel size for both width and height. Default 32. */
  size?: number;
  /** When true, render the wordmark "朝夕" alongside the icon (horizontal). */
  withWord?: boolean;
  /** Override word size; defaults proportional to icon. */
  wordSize?: number;
  className?: string;
}

/**
 * 朝夕 brand mark. Conic-style diagonal gradient from 晨橙 (sunrise) to 暮紫
 * (dusk), with a thin horizon line through the middle. Visual concept:
 * one circle that holds both halves of the day.
 *
 * SVG-only (no CSS background tricks) so it serializes clean for favicons,
 * screenshots, and dark-mode flips. Each instance gets a unique gradient ID
 * via {@link useId} so multiple marks on the same page don't clash.
 */
export default function ZhaoxiLogo({
  size = 32,
  withWord = false,
  wordSize,
  className,
}: Props) {
  const gradId = useId();

  const icon = (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="朝夕"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb923c" /> {/* 晨橙 */}
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4c1d95" /> {/* 暮紫 */}
        </linearGradient>
      </defs>
      {/* Disc */}
      <circle cx="16" cy="16" r="14" fill={`url(#${gradId})`} />
      {/* Highlight rim — top-left, suggests the sunlit edge of the morning side */}
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.6"
      />
      {/* Horizon line — split the day, with a tiny gap in the middle so the
          mark reads as two halves rather than a hard cut. */}
      <line x1="5" y1="16" x2="14.5" y2="16" stroke="rgba(255,255,255,0.55)" strokeWidth="0.7" strokeLinecap="round" />
      <line x1="17.5" y1="16" x2="27" y2="16" stroke="rgba(255,255,255,0.55)" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  );

  if (!withWord) {
    return <span className={className} style={{ display: 'inline-flex' }}>{icon}</span>;
  }

  const fontPx = wordSize ?? Math.round(size * 0.62);
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(6, Math.round(size * 0.22)),
      }}
    >
      {icon}
      <span
        style={{
          fontSize: fontPx,
          fontWeight: 600,
          letterSpacing: '0.04em',
          lineHeight: 1,
          color: 'var(--fg)',
        }}
      >
        朝夕
      </span>
    </span>
  );
}
