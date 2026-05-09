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
  onUnauthorized: () => {
    // 先清 token/user,否则 LoginRoute 看到旧 token 又跳回主页 ->
    // 主页 API 仍 401 -> 又跳 /login -> F5 死循环。
    localStorage.removeItem('xg_token');
    localStorage.removeItem('xg_user');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },
});

export default api;
