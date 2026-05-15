import { createApiClient } from '@xg1/shared';

/**
 * 共享的"401 → 清 token / 跳登录"动作。
 * raw fetch 直连 sidecar 的调用方(rolePermission.ts / workStudy.ts)
 * 不走 axios 拦截器,但需要同样的 401 行为,集中到一处避免散乱。
 */
export function handleUnauthorized() {
  // 先清 token/user,否则 LoginRoute 看到旧 token 又跳回主页 ->
  // 主页 API 仍 401 -> 又跳 /login -> F5 死循环。
  localStorage.removeItem('xg_token');
  localStorage.removeItem('xg_user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

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
  onUnauthorized: handleUnauthorized,
});

export default api;
