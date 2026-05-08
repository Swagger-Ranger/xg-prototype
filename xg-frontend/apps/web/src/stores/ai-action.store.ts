import { create } from 'zustand';

export interface AIAction {
  type: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/** Right-side panel context visible to AI */
export interface PanelContext {
  page: string;
  modal?: string;
  formData?: Record<string, unknown>;
}

/** Events from the right panel that should appear in chat */
export interface PanelEvent {
  type: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/** An object the user has pinned from the right panel into the AI input context. */
export interface PinnedRef {
  type: string;     // 'student' | 'insight' | 'leave' | 'alert' | 'counselor' | ...
  id: string;       // stable identifier within its type
  label: string;    // display label on the chip
  detail?: string;  // optional extra context passed to the LLM (e.g. "软件2301班")
}

/** A transient signal telling the right panel "visually highlight these objects now". */
export interface HighlightSignal {
  items: { type: string; id: string }[];
  timestamp: number;
}

/**
 * A seed for the AI input box — pushed by "问 AI" chips on workspace rows so
 * the panel jumps into a pre-filled question without the user typing.
 */
export interface InputSeed {
  text: string;
  /** Whether the seeded text should be auto-sent (true) or just inserted (false). */
  send?: boolean;
  timestamp: number;
}

/** Live hover from the AI panel (pinned chip) → left panel row (row pulses). */
export type HoverRef = { type: string; id: string } | null;

interface AIActionState {
  // AI → right panel
  action: AIAction | null;
  dispatch: (type: string, data?: Record<string, unknown>) => void;
  consume: () => void;

  // Right panel → AI (context)
  panelContext: PanelContext;
  setContext: (ctx: Partial<PanelContext>) => void;

  // Right panel → AI (events)
  panelEvent: PanelEvent | null;
  emitEvent: (type: string, data?: Record<string, unknown>) => void;
  consumeEvent: () => void;

  // Right panel → AI (pinned objects for the next message)
  pinnedRefs: PinnedRef[];
  pinRef: (ref: PinnedRef) => void;
  unpinRef: (type: string, id: string) => void;
  clearPinnedRefs: () => void;

  // AI → right panel (visual highlight signals, self-expire after 3s)
  highlight: HighlightSignal | null;
  emitHighlight: (items: { type: string; id: string }[]) => void;
  consumeHighlight: () => void;

  // Workspace row → AI panel: pre-fill input, optionally auto-send.
  inputSeed: InputSeed | null;
  seedInput: (text: string, opts?: { send?: boolean }) => void;
  consumeInputSeed: () => void;

  // AI pinned chip hover → workspace row (live while hovering; cleared on leave).
  hoveredRef: HoverRef;
  setHoveredRef: (ref: HoverRef) => void;
}

export const useAIActionStore = create<AIActionState>((set) => ({
  action: null,
  dispatch: (type, data) => set({ action: { type, data, timestamp: Date.now() } }),
  consume: () => set({ action: null }),

  panelContext: { page: 'workspace' },
  setContext: (ctx) => set((s) => ({ panelContext: { ...s.panelContext, ...ctx } })),

  panelEvent: null,
  emitEvent: (type, data) => set({ panelEvent: { type, data, timestamp: Date.now() } }),
  consumeEvent: () => set({ panelEvent: null }),

  pinnedRefs: [],
  pinRef: (ref) =>
    set((s) => {
      const key = `${ref.type}:${ref.id}`;
      if (s.pinnedRefs.some((r) => `${r.type}:${r.id}` === key)) return s;
      return { pinnedRefs: [...s.pinnedRefs, ref] };
    }),
  unpinRef: (type, id) =>
    set((s) => ({ pinnedRefs: s.pinnedRefs.filter((r) => !(r.type === type && r.id === id)) })),
  clearPinnedRefs: () => set({ pinnedRefs: [] }),

  highlight: null,
  emitHighlight: (items) => {
    if (items.length === 0) return;
    const ts = Date.now();
    set({ highlight: { items, timestamp: ts } });
    // Self-expire after 3s so late-mounting pages (e.g. user navigates to /student
    // right after asking) still see the signal, but stale signals don't linger.
    setTimeout(() => {
      const cur = useAIActionStore.getState().highlight;
      if (cur && cur.timestamp === ts) {
        useAIActionStore.setState({ highlight: null });
      }
    }, 3000);
  },
  consumeHighlight: () => set({ highlight: null }),

  inputSeed: null,
  seedInput: (text, opts) =>
    set({ inputSeed: { text, send: opts?.send === true, timestamp: Date.now() } }),
  consumeInputSeed: () => set({ inputSeed: null }),

  hoveredRef: null,
  setHoveredRef: (ref) => set({ hoveredRef: ref }),
}));
