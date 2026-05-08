import { create } from 'zustand';
import type { UserInfo } from '@xg1/shared';

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  setAuth: (token: string, user: UserInfo) => void;
  /** Refresh the cached user without touching the token (e.g. after profile edit). */
  setUser: (user: UserInfo) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('xg_token'),
  user: (() => {
    try {
      const u = localStorage.getItem('xg_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })(),

  setAuth: (token, user) => {
    localStorage.setItem('xg_token', token);
    localStorage.setItem('xg_user', JSON.stringify(user));
    set({ token, user });
  },

  setUser: (user) => {
    localStorage.setItem('xg_user', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('xg_token');
    localStorage.removeItem('xg_user');
    set({ token: null, user: null });
  },
}));
