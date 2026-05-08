import { useEffect, useState } from 'react';
import XiaozhaoAvatar from './XiaozhaoAvatar';
import XiaoxiAvatar from './XiaoxiAvatar';

export type AssistantPersona = {
  name: '小朝' | '小夕';
  period: 'day' | 'night';
};

/**
 * Resolve the assistant's current persona from the wall clock. Day window
 * is 06:00–17:59 inclusive; everything else is night. Two thirteen-line
 * forms, one round-the-clock brand: 朝夕 = 朝 (sun) + 夕 (moon).
 */
export function getAssistantPersona(now: Date = new Date()): AssistantPersona {
  const h = now.getHours();
  return h >= 6 && h < 18
    ? { name: '小朝', period: 'day' }
    : { name: '小夕', period: 'night' };
}

/**
 * Hook that re-evaluates the persona once a minute so a panel left open
 * across the day/night boundary swaps avatars without a full reload.
 * Cheap (no DOM work unless the period actually flips).
 */
export function useAssistantPersona(): AssistantPersona {
  const [persona, setPersona] = useState<AssistantPersona>(() => getAssistantPersona());
  useEffect(() => {
    const tick = () => {
      const next = getAssistantPersona();
      // Only set state when the period changes — otherwise React would still
      // bail on shallow equality but this avoids the call entirely.
      setPersona((prev) => (prev.period === next.period ? prev : next));
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return persona;
}

/**
 * Time-aware avatar — sun face by day, moon face by night. Drop-in
 * replacement wherever the panel previously rendered XiaoxiAvatar.
 */
export default function AssistantAvatar() {
  const { period } = useAssistantPersona();
  return period === 'day' ? <XiaozhaoAvatar /> : <XiaoxiAvatar />;
}
