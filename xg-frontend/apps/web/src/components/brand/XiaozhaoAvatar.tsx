import styles from './XiaozhaoAvatar.module.css';

const RAY_COUNT = 8;

/**
 * 小朝 — daytime form of the AI assistant. Sun face: warm radial gradient
 * disc + a slow-rotating ring of soft rays, cute oval eyes with a tiny
 * highlight, peach cheeks, and a slightly more upturned smile than the
 * night-form moon (sun = energetic / cheerful, moon = calm).
 *
 * Animations: 4s breathe + 12s ray rotation + 6s occasional blink. All
 * disabled under `prefers-reduced-motion`.
 */
export default function XiaozhaoAvatar() {
  return (
    <svg
      viewBox="0 0 64 64"
      className={styles.sun}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="xzSunBody" cx="0.42" cy="0.32" r="0.78">
          <stop offset="0" stopColor="#fffbeb" />
          <stop offset="50%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        <radialGradient id="xzSunHi" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rays — drawn behind the disc so they peek out from the edge. Each
          ray is a small rounded rectangle anchored just outside the disc. */}
      <g className={styles.rays} fill="#fbbf24">
        {Array.from({ length: RAY_COUNT }, (_, i) => (
          <rect
            key={i}
            x="31"
            y="2"
            width="2"
            height="6"
            rx="1"
            transform={`rotate(${(i * 360) / RAY_COUNT} 32 32)`}
          />
        ))}
      </g>

      <g className={styles.body}>
        {/* Sun disc */}
        <circle cx="32" cy="32" r="22" fill="url(#xzSunBody)" />

        {/* Painterly highlight — same trick as the moon but stronger so the
            day form reads brighter / more energetic. */}
        <ellipse cx="22" cy="22" rx="9" ry="6" fill="url(#xzSunHi)" />

        {/* Cheeks — slightly rosier than the moon's. Sun = warm energy. */}
        <ellipse cx="20" cy="36" rx="3.4" ry="2.2" fill="#fb7185" opacity="0.4" />
        <ellipse cx="44" cy="36" rx="3.4" ry="2.2" fill="#fb7185" opacity="0.4" />

        {/* Eyes — same proportions as the moon for character continuity. */}
        <g className={`${styles.eye} ${styles.eyeL}`}>
          <ellipse cx="25" cy="30" rx="2.4" ry="3.1" fill="#1f1611" />
          <circle cx="26" cy="28.7" r="0.85" fill="#ffffff" />
        </g>
        <g className={`${styles.eye} ${styles.eyeR}`}>
          <ellipse cx="39" cy="30" rx="2.4" ry="3.1" fill="#1f1611" />
          <circle cx="40" cy="28.7" r="0.85" fill="#ffffff" />
        </g>

        {/* Smile — a touch wider arc than the moon's calm smile, sun is the
            extroverted twin. */}
        <path
          d="M28 38 Q32 41.2 36 38"
          fill="none"
          stroke="#7c2d12"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
