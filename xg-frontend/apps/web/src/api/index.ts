import { createApiClient } from '@xg1/shared';

const api = createApiClient({
  baseURL: '/api/v1',
  getToken: () => localStorage.getItem('xg_token'),
  getTenantId: () => {
    try {
      const u = localStorage.getItem('xg_user');
      if (u) {
        const user = JSON.parse(u);
        return user.tenant_id ?? null;
      }
    } catch {}
    return null;
  },
  getUserId: () => {
    try {
      const u = localStorage.getItem('xg_user');
      if (u) {
        const user = JSON.parse(u);
        return user.id ?? null;
      }
    } catch {}
    return null;
  },
  onUnauthorized: () => {
    window.location.href = '/login';
  },
});

export default api;
