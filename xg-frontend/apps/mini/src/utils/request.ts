import Taro from '@tarojs/taro';

// Build-time injection via Taro defineConstants is unreliable in this setup
// (mini-app runtime has no `process` object). Use typeof guard so the access
// itself doesn't throw, and fall back to localhost.
const _proc = typeof process !== 'undefined' ? process : undefined;
const BASE_URL = (_proc?.env?.XG_API_BASE_URL as string | undefined) || 'http://localhost:8080/api/v1';
const AI_BASE_URL = (_proc?.env?.XG_AI_BASE_URL as string | undefined) || 'http://localhost:8001/api/v1';

interface ApiEnvelope<T> {
  code?: number;
  data?: T;
  message?: string;
}

function authHeaders(): Record<string, string> {
  const token = Taro.getStorageSync('token') || '';
  const userId = Taro.getStorageSync('userId') || '';
  const tenantId = Taro.getStorageSync('tenantId') || 'default';
  const headers: Record<string, string> = {
    'X-User-Id': String(userId),
    'X-Tenant-Id': String(tenantId),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 兜门处理 401。多个并发请求同时拿 401 时只触发一次 reLaunch——
 *  否则 WeChat 在 page mount 期间被多次重新启动会触发 onLoad 超时。 */
let _redirecting = false;
function handleUnauthorized() {
  if (_redirecting) return;
  _redirecting = true;
  Taro.removeStorageSync('token');
  Taro.removeStorageSync('userId');
  Taro.reLaunch({ url: '/pages/login/index' }).finally(() => {
    // 给下次会话恢复机会
    setTimeout(() => { _redirecting = false; }, 1000);
  });
}

/** 默认请求超时 8s——避免一根挂死的请求导致 page onLoad 5s 看门狗超时。 */
const DEFAULT_TIMEOUT_MS = 8000;

export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await Taro.request<ApiEnvelope<T>>({
    url: `${BASE_URL}${path}`,
    method: 'GET',
    data: params,
    header: authHeaders(),
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (res.statusCode === 401) {
    handleUnauthorized();
    throw new Error('未登录');
  }
  if (res.statusCode >= 400) {
    throw new Error(res.data?.message || `HTTP ${res.statusCode}`);
  }
  return (res.data?.data ?? (res.data as unknown as T));
}

export async function postAi<T>(path: string, body?: unknown): Promise<T> {
  const userId = Taro.getStorageSync('userId') || '';
  const tenantId = Taro.getStorageSync('tenantId') || 'default';
  const user = Taro.getStorageSync('user') as { roleCodes?: string[] } | undefined;
  const role = user?.roleCodes?.[0] || 'student';
  const res = await Taro.request<{ output?: string; tool?: string }>({
    url: `${AI_BASE_URL}${path}`,
    method: 'POST',
    data: body,
    header: {
      'Content-Type': 'application/json',
      'X-User-Id': String(userId),
      'X-Tenant-Id': String(tenantId),
      'X-User-Role': role,
    },
    // AI 调用一般慢，给更长超时（DeepSeek 7-30s）
    timeout: 45000,
  });
  if (res.statusCode >= 400) {
    throw new Error(`AI HTTP ${res.statusCode}`);
  }
  return res.data as T;
}

export async function post<T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const header = opts?.skipAuth ? baseHeaders : { ...baseHeaders, ...authHeaders() };
  const res = await Taro.request<ApiEnvelope<T>>({
    url: `${BASE_URL}${path}`,
    method: 'POST',
    data: body,
    header,
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (res.statusCode === 401) {
    handleUnauthorized();
    throw new Error('未登录');
  }
  if (res.statusCode >= 400) {
    throw new Error(res.data?.message || `HTTP ${res.statusCode}`);
  }
  return (res.data?.data ?? (res.data as unknown as T));
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await Taro.request<ApiEnvelope<T>>({
    url: `${BASE_URL}${path}`,
    method: 'PUT',
    data: body,
    header: { 'Content-Type': 'application/json', ...authHeaders() },
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (res.statusCode === 401) {
    handleUnauthorized();
    throw new Error('未登录');
  }
  if (res.statusCode >= 400) {
    throw new Error(res.data?.message || `HTTP ${res.statusCode}`);
  }
  return (res.data?.data ?? (res.data as unknown as T));
}
