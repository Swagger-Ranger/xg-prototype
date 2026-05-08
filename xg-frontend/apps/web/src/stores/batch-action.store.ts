import { create } from 'zustand';

export interface BatchItem {
  id: string;
  title: string;
  subtitle?: string;
  detail?: string;
  /** Disabled items render greyed-out, aren't selectable, and tell the user why. */
  disabled?: boolean;
  disabledReason?: string;
  /** Optional extra payload the executor can read — e.g. the resolved taskId. */
  meta?: Record<string, unknown>;
}

export interface BatchFailure {
  itemId: string;
  reason: string;
}

export interface BatchResult {
  total: number;
  success: number;
  fail: number;
  failures: BatchFailure[];
}

/**
 * The executor receives the list of selected item IDs and the user-entered
 * comment. It is responsible for translating each ID into a backend call and
 * returning a summary. Partial failure is expected, not fatal.
 */
export type BatchExecutor = (
  selectedIds: string[],
  comment: string,
) => Promise<BatchResult>;

export interface BatchActionSpec {
  /** Title shown in drawer header. */
  title: string;
  /** Short prose explaining what will happen. */
  description?: string;
  /** Primary action label, e.g. "批准所选". */
  confirmLabel: string;
  /** Tone drives color of confirm button; danger = red, primary = accent. */
  confirmTone?: 'primary' | 'danger';
  /** Show a comment textarea? Defaults true. */
  commentEnabled?: boolean;
  /** Placeholder text for the comment box. */
  commentPlaceholder?: string;
  items: BatchItem[];
  executor: BatchExecutor;
}

interface BatchActionState {
  open: boolean;
  spec: BatchActionSpec | null;
  /** Preparing items (async resolve of refs → tasks). */
  preparing: boolean;
  prepareError: string | null;
  /** Item IDs currently selected for execution. */
  selectedIds: Set<string>;
  comment: string;
  executing: boolean;
  result: BatchResult | null;

  openLoading: (title: string, description?: string) => void;
  openWithSpec: (spec: BatchActionSpec) => void;
  setPrepareError: (msg: string) => void;
  close: () => void;

  toggleSelect: (id: string) => void;
  setAllSelected: (on: boolean) => void;
  setComment: (s: string) => void;

  runExecutor: () => Promise<void>;
  resetResult: () => void;
}

const INITIAL: Pick<
  BatchActionState,
  'open' | 'spec' | 'preparing' | 'prepareError' | 'selectedIds' | 'comment' | 'executing' | 'result'
> = {
  open: false,
  spec: null,
  preparing: false,
  prepareError: null,
  selectedIds: new Set(),
  comment: '',
  executing: false,
  result: null,
};

export const useBatchActionStore = create<BatchActionState>((set, get) => ({
  ...INITIAL,

  openLoading: (title, description) =>
    set({
      open: true,
      preparing: true,
      prepareError: null,
      spec: {
        title,
        description,
        confirmLabel: '',
        items: [],
        executor: async () => ({ total: 0, success: 0, fail: 0, failures: [] }),
      },
      selectedIds: new Set(),
      comment: '',
      executing: false,
      result: null,
    }),

  openWithSpec: (spec) =>
    set({
      open: true,
      spec,
      preparing: false,
      prepareError: null,
      selectedIds: new Set(spec.items.filter((i) => !i.disabled).map((i) => i.id)),
      comment: '',
      executing: false,
      result: null,
    }),

  setPrepareError: (msg) =>
    set({ preparing: false, prepareError: msg }),

  close: () => set({ ...INITIAL }),

  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  setAllSelected: (on) =>
    set((s) => ({
      selectedIds: new Set(
        on && s.spec ? s.spec.items.filter((i) => !i.disabled).map((i) => i.id) : [],
      ),
    })),

  setComment: (s) => set({ comment: s }),

  runExecutor: async () => {
    const { spec, selectedIds, comment, executing } = get();
    if (!spec || executing || selectedIds.size === 0) return;
    set({ executing: true, result: null });
    try {
      const result = await spec.executor(Array.from(selectedIds), comment);
      set({ executing: false, result });
    } catch (err) {
      const reason = err instanceof Error ? err.message : '执行失败';
      set({
        executing: false,
        result: {
          total: selectedIds.size,
          success: 0,
          fail: selectedIds.size,
          failures: Array.from(selectedIds).map((id) => ({ itemId: id, reason })),
        },
      });
    }
  },

  resetResult: () =>
    set((s) => ({
      result: null,
      // Deselect items that succeeded so retry only targets failures.
      selectedIds: s.result
        ? new Set(s.result.failures.map((f) => f.itemId))
        : s.selectedIds,
    })),
}));
