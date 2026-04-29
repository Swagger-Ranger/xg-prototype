import Taro from '@tarojs/taro';

// Injected at build time via Taro defineConstants (config/{dev,prod}.ts).
// Falls back to localhost so unit tests / IDE typecheck still resolve.
const BASE_URL = process.env.XG_API_BASE_URL || 'http://localhost:8080/api/v1';
const AI_BASE_URL = process.env.XG_AI_BASE_URL || 'http://localhost:8001/api/v1';

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

function handleUnauthorized() {
  Taro.removeStorageSync('token');
  Taro.removeStorageSync('userId');
  Taro.reLaunch({ url: '/pages/login/index' });
}

export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await Taro.request<ApiEnvelope<T>>({
    url: `${BASE_URL}${path}`,
    method: 'GET',
    data: params,
    header: authHeaders(),
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
