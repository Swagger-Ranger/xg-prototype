import { motion } from 'motion/react';
import styles from './FloatingSymbols.module.css';

/**
 * 学科符号轻飘层 — DOM/motion 实现，跟 SkyScene 互不干扰。
 * 数学 / 物理 / 读书 混合的 10 个 Unicode 符号，超低不透明度缓慢上下漂。
 * pointer-events: none 不挡卡片。
 */

interface Item {
  symbol: string;
  left: string;
  top: string;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  drift: number;
}

const ITEMS: Item[] = [
  { symbol: '∑', left: '6%',  top: '18%', size: 38, opacity: 0.14, duration: 34, delay: 0.0, drift: 12 },
  { symbol: '∫', left: '88%', top: '24%', size: 44, opacity: 0.12, duration: 40, delay: 2.0, drift: 10 },
  { symbol: 'π', left: '14%', top: '70%', size: 30, opacity: 0.16, duration: 28, delay: 4.0, drift: 14 },
  { symbol: 'λ', left: '78%', top: '62%', size: 32, opacity: 0.13, duration: 36, delay: 1.0, drift: 11 },
  { symbol: 'θ', left: '44%', top: '12%', size: 26, opacity: 0.14, duration: 32, delay: 5.0, drift: 9 },
  { symbol: '★', left: '22%', top: '40%', size: 22, opacity: 0.11, duration: 42, delay: 1.5, drift: 16 },
  { symbol: '✎', left: '62%', top: '78%', size: 28, opacity: 0.15, duration: 30, delay: 3.0, drift: 13 },
  { symbol: '√', left: '92%', top: '48%', size: 34, opacity: 0.13, duration: 38, delay: 6.0, drift: 10 },
  { symbol: 'Ω', left: '34%', top: '82%', size: 30, opacity: 0.12, duration: 35, delay: 2.5, drift: 12 },
  { symbol: '≈', left: '54%', top: '38%', size: 28, opacity: 0.10, duration: 40, delay: 5.5, drift: 15 },
];

export default function FloatingSymbols() {
  return (
    <div className={styles.layer} aria-hidden="true">
      {ITEMS.map((it, i) => (
        <motion.span
          key={i}
          className={styles.symbol}
          initial={{ y: it.drift, opacity: 0 }}
          animate={{
            y: [it.drift, -it.drift, it.drift],
            x: [-it.drift * 0.5, it.drift * 0.5, -it.drift * 0.5],
            opacity: [0, it.opacity, 0],
          }}
          transition={{
            duration: it.duration,
            delay: it.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            left: it.left,
            top: it.top,
            fontSize: it.size,
          }}
        >
          {it.symbol}
        </motion.span>
      ))}
    </div>
  );
}
