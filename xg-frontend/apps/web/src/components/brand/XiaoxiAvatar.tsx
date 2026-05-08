import styles from './XiaoxiAvatar.module.css';

/**
 * 小夕 — 朝夕 brand's AI assistant mascot. A soft moon face matching the
 * "夕" half of the brand name (dusk / moon).
 *
 * v2 redesign vs the puffer-replacement first cut:
 *  • cream → warm-yellow radial gradient (drops the harsh amber rim)
 *  • bigger oval eyes with a tiny white highlight (alive, not button-like)
 *  • painterly top-left highlight blob for spherical roundness
 *  • soft peach cheeks (very low opacity, just enough to round the face)
 *  • smaller, gentler smile (was a flat geometric arc, felt clinical)
 *  • dropped the three crater dots (read as age spots, not character)
 *
 * Idle: gentle breathing (4.2s) + occasional blink (~6.8s).
 */
export default function XiaoxiAvatar() {
  return (
    <svg
      viewBox="0 0 64 64"
      className={styles.moon}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="xxMoonBody" cx="0.4" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#fffbeb" />
          <stop offset="55%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fcd34d" />
        </radialGradient>
        <radialGradient id="xxMoonHi" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className={styles.body}>
        {/* Moon disc */}
        <circle cx="32" cy="32" r="26" fill="url(#xxMoonBody)" />

        {/* Painterly highlight — top-left, gives the disc a soft spherical
            feel without resorting to a hard inner stroke. */}
        <ellipse cx="22" cy="20" rx="11" ry="8" fill="url(#xxMoonHi)" />

        {/* Cheeks — barely-there peach. Removes "lifeless yellow ball" feel. */}
        <ellipse cx="20" cy="38" rx="3.5" ry="2.2" fill="#fda4af" opacity="0.35" />
        <ellipse cx="44" cy="38" rx="3.5" ry="2.2" fill="#fda4af" opacity="0.35" />

        {/* Eyes — tall ovals + tiny white catchlight. Larger than v1 so the
            face reads at avatar sizes (down to 16px in some lists). */}
        <g className={`${styles.eye} ${styles.eyeL}`}>
          <ellipse cx="25" cy="32" rx="2.6" ry="3.4" fill="#1f1611" />
          <circle cx="26" cy="30.5" r="0.9" fill="#ffffff" />
        </g>
        <g className={`${styles.eye} ${styles.eyeR}`}>
          <ellipse cx="39" cy="32" rx="2.6" ry="3.4" fill="#1f1611" />
          <circle cx="40" cy="30.5" r="0.9" fill="#ffffff" />
        </g>

        {/* Small soft smile — subtle U-arc, not a wide grin. Reads as
            "calm and present". */}
        <path
          d="M29.5 40.5 Q32 42.4 34.5 40.5"
          fill="none"
          stroke="#7c2d12"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
