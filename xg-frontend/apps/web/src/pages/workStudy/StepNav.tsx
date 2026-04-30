import { Fragment } from 'react';
import styles from './StepNav.module.css';

export interface StepDef<V extends string> {
  value: V;
  /** 1-indexed display number (so callers control the labelling). */
  n: number;
  title: string;
  hint?: string;
}

export interface StepNavProps<V extends string> {
  steps: StepDef<V>[];
  value: V;
  onChange: (v: V) => void;
}

/**
 * Role-aware horizontal stepper. Visually a tab strip, but each entry shows a
 * numbered dot + a hint line so the staff can see "what step in the workflow
 * am I on" at a glance. Steps are clickable in any order — a user might jump
 * back to step 2 from step 5 — and don't carry hard prerequisites.
 */
export default function StepNav<V extends string>({ steps, value, onChange }: StepNavProps<V>) {
  return (
    <nav className={styles.nav} aria-label="工作流步骤">
      {steps.map((s, i) => (
        <Fragment key={s.value}>
          <button
            type="button"
            className={`${styles.step} ${value === s.value ? styles.active : ''}`}
            onClick={() => onChange(s.value)}
          >
            <span className={styles.dot}>{s.n}</span>
            <span className={styles.body}>
              <span className={styles.title}>{s.title}</span>
              {s.hint && <span className={styles.hint}>{s.hint}</span>}
            </span>
          </button>
          {i < steps.length - 1 && <span className={styles.sep}>›</span>}
        </Fragment>
      ))}
    </nav>
  );
}
