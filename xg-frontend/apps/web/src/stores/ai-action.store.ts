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
}));
