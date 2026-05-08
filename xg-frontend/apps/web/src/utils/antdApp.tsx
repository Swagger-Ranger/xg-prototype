import { App as AntApp, message as antdMessage } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';

/**
 * Bridge between Antd 5's preferred App.useApp() hook and the legacy static
 * `message.xxx()` / `Modal.confirm()` style this codebase uses in 40+ places.
 *
 * Why this exists: Antd 5 logs a warning whenever static API is called outside
 * an <App> ancestor — even when one IS in the tree, because the static export
 * doesn't read context. The fix recommended by Antd is to switch to the
 * `App.useApp()` hook in every component, but that's a 40-file refactor.
 *
 * What this does instead:
 *   1. {@link AntdAppBridge} mounts once inside <App>, captures the hook's
 *      message / modal / notification instances.
 *   2. The exported {@link message} / {@link modal} / {@link notification}
 *      below are Proxies that forward calls to the captured instances when
 *      available (and fall back to antd's static API on the rare call before
 *      mount — harmless, just warns once).
 *
 * Migration usage: change
 *     import { message } from 'antd';
 * to
 *     import { message } from '@/utils/antdApp';
 * No other line changes; call sites stay {@code message.success(...)}.
 */

let messageRef: MessageInstance | null = null;
let modalRef: Omit<ModalStaticFunctions, 'warn'> | null = null;
let notificationRef: NotificationInstance | null = null;

function makeProxy<T extends object>(getRef: () => T | null, fallback: T): T {
  return new Proxy(fallback, {
    get(_, prop, receiver) {
      const live = getRef();
      const target = live ?? fallback;
      const value = Reflect.get(target as object, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });
}

export const message: MessageInstance = makeProxy(
  () => messageRef,
  antdMessage as unknown as MessageInstance,
);

// Antd's static Modal has the same shape but no live ref until bridge mounts;
// callers use Modal.confirm({...}) etc. Proxy through the captured hook
// instance once available.
const modalFallback = {
  confirm: () => { throw new Error('AntdAppBridge not mounted'); },
  info: () => { throw new Error('AntdAppBridge not mounted'); },
  success: () => { throw new Error('AntdAppBridge not mounted'); },
  error: () => { throw new Error('AntdAppBridge not mounted'); },
  warning: () => { throw new Error('AntdAppBridge not mounted'); },
} as unknown as Omit<ModalStaticFunctions, 'warn'>;

export const modal = makeProxy(() => modalRef, modalFallback);

const notificationFallback = {
  open: () => undefined,
  info: () => undefined,
  success: () => undefined,
  warning: () => undefined,
  error: () => undefined,
  destroy: () => undefined,
} as unknown as NotificationInstance;

export const notification = makeProxy(() => notificationRef, notificationFallback);

/**
 * Render once inside <App>. After first effect, all `message`/`modal`/
 * `notification` calls from this module route through the context-aware
 * hook instance, silencing antd v5's "Static function can not consume
 * context" warning.
 */
export function AntdAppBridge() {
  const app = AntApp.useApp();
  // Capture each render — App.useApp() returns stable instances per
  // ConfigProvider, so this assignment is effectively a one-shot init.
  messageRef = app.message;
  modalRef = app.modal;
  notificationRef = app.notification;
  return null;
}
