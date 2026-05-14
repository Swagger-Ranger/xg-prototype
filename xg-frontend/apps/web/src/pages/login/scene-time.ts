/**
 * 朝夕循环共享时钟。SkyScene 的 shader 与登录页时刻指示器引用同一起点，
 * 保证屏幕上"现在是日落"的标签真的对应 shader 里日落相位。
 */

export const SCENE_CYCLE_MS = 60_000;

let started = 0;
export function sceneStart(): number {
  if (!started) started = performance.now();
  return started;
}

export function currentPhase(): number {
  return ((performance.now() - sceneStart()) / SCENE_CYCLE_MS) % 1;
}

export function phaseLabel(p: number): string {
  if (p < 0.04) return '凌晨';
  if (p < 0.13) return '黎明';
  if (p < 0.22) return '日出';
  if (p < 0.42) return '上午';
  if (p < 0.52) return '正午';
  if (p < 0.62) return '日落';
  if (p < 0.78) return '黄昏';
  return '夜晚';
}
