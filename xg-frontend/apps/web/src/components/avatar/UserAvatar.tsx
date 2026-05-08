import { useState } from 'react';
import styles from './UserAvatar.module.css';

interface Props {
  /** Optional uploaded avatar URL — winning source. */
  avatarUrl?: string | null;
  /** Stable identifier (sys_user.id or username) — feeds the deterministic fallback. */
  seed: string | number;
  /** Used as the final letter-fallback if both image sources fail. */
  name?: string | null;
  /** Pixel size (rendered as both width and height). Default 36. */
  size?: number;
  /** Extra class for the outer wrapper (gradient ring, shadow, etc.). */
  className?: string;
}

const DICEBEAR_BASE = 'https://api.dicebear.com/7.x/avataaars/svg';

// Constrain the random palette to skin tones that read as plausibly East
// Asian for this product's user population. DiceBear's full set is
// tanned / yellow / pale / light / brown / darkBrown / black — we keep the
// first four. Same idea as picking a culturally appropriate emoji default
// rather than the generic "yellow blob".
const SKIN_TONES = 'yellow,pale,light,tanned';

function dicebearUrl(seed: string | number): string {
  // backgroundColor=transparent so the gradient ring on .wrap shows through.
  // radius=50 gives DiceBear's circular crop so the SVG fills the round wrap.
  return `${DICEBEAR_BASE}?seed=${encodeURIComponent(String(seed))}`
    + `&radius=50&backgroundColor=transparent`
    + `&skinColor=${SKIN_TONES}`;
}

/**
 * Two-stage cascade: uploaded avatar → DiceBear-generated face → first-letter
 * placeholder. Each stage degrades on `onError`, so a flaky CDN or a deleted
 * upload never leaves an empty hole.
 *
 * Generated stage is deterministic: same seed always renders the same face,
 * so you don't get a refresh-flicker between visits.
 */
export default function UserAvatar({
  avatarUrl,
  seed,
  name,
  size = 36,
  className,
}: Props) {
  // 0 = uploaded, 1 = generated, 2 = letter
  const initialStage = avatarUrl && avatarUrl.trim() !== '' ? 0 : 1;
  const [stage, setStage] = useState<0 | 1 | 2>(initialStage);

  const letter = (name?.trim()?.charAt(0) || String(seed).charAt(0) || '?').toUpperCase();
  const wrapStyle = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (stage === 2) {
    return (
      <span className={`${styles.wrap} ${styles.letter} ${className ?? ''}`} style={wrapStyle}>
        {letter}
      </span>
    );
  }

  const src = stage === 0 ? avatarUrl! : dicebearUrl(seed);
  return (
    <span className={`${styles.wrap} ${className ?? ''}`} style={wrapStyle}>
      <img
        src={src}
        alt={name ?? String(seed)}
        className={styles.img}
        onError={() => setStage((s) => (s === 0 ? 1 : 2))}
        draggable={false}
      />
    </span>
  );
}
