import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node ≥ 22 ships a stub `localStorage` global without a backing file, which
// shadows jsdom's real Storage in vitest. Install a Map-backed Storage shim
// for both `window.localStorage` and bare `localStorage` references.
if (typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(window, 'localStorage', { value: fake, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: fake, writable: true, configurable: true });
}

// jsdom doesn't implement matchMedia (used by antd's responsive grid)
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// echarts requires a canvas; jsdom returns null. Stub it.
if (!HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
}

afterEach(() => cleanup());
