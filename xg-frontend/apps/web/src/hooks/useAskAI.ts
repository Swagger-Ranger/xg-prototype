import { useCallback } from 'react';
import { useAIActionStore, type PinnedRef } from '@/stores/ai-action.store';

interface AskOptions {
  ref: PinnedRef;
  /**
   * Prompt template. Placeholders:
   *   {label}  → ref.label
   *   {detail} → ref.detail or ref.label when detail is missing
   *   {type}   → ref.type
   *   {id}     → ref.id
   */
  prompt: string;
  /** Send immediately (true) or just seed the input box (false). */
  autoSend?: boolean;
  /** Whether to also pin the ref so subsequent messages keep the subject. */
  pin?: boolean;
}

/**
 * `useAskAI` is the unified entry for "row-level → AI panel" interactions.
 * Callers on workspace pages (student rows, leave rows, alert rows…) get a
 * single function that:
 *   1. optionally pins the subject so the next messages still carry context,
 *   2. resolves the prompt template using the ref's fields,
 *   3. seeds (and optionally auto-sends) the AI input box.
 */
export function useAskAI() {
  const pinRef = useAIActionStore((s) => s.pinRef);
  const seedInput = useAIActionStore((s) => s.seedInput);

  return useCallback(
    ({ ref, prompt, autoSend = false, pin = true }: AskOptions) => {
      if (pin) pinRef(ref);
      const resolved = prompt
        .split('{label}').join(ref.label)
        .split('{detail}').join(ref.detail ?? ref.label)
        .split('{type}').join(ref.type)
        .split('{id}').join(ref.id);
      seedInput(resolved, { send: autoSend });
    },
    [pinRef, seedInput],
  );
}
