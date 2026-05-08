import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiResponse, PageResult } from '../types/api';

export interface ClientConfig {
  baseURL: string;
  getToken: () => string | null;
  getTenantId: () => string | null;
  getUserId: () => string | null;
  onUnauthorized: () => void;
}

export function createApiClient(config: ClientConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseURL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Request interceptor: inject auth token and tenant
  client.interceptors.request.use((req) => {
    const token = config.getToken();
    if (token) {
      req.headers.Authorization = `Bearer ${token}`;
    }
    const tenantId = config.getTenantId();
    if (tenantId) {
      req.headers['X-Tenant-Id'] = tenantId;
    }
    const userId = config.getUserId();
    if (userId) {
      req.headers['X-User-Id'] = userId;
    }
    return req;
  });

  // Response interceptor: unwrap ApiResponse, handle errors
  client.interceptors.response.use(
    (res) => {
      const body = res.data as ApiResponse;
      if (body.code !== 'SUCCESS') {
        return Promise.reject(new ApiError(body.code, body.message));
      }
      // Replace response data with unwrapped `data` field
      res.data = body.data;
      return res;
    },
    (error) => {
      if (error.response?.status === 401) {
        config.onUnauthorized();
      }
      // BizException → HTTP 4xx with R body {code, message}. Unwrap it so
      // callers see the localized message via err.message instead of axios'
      // generic "Request failed with status code 400".
      const body = error.response?.data as ApiResponse | undefined;
      if (body && typeof body === 'object' && body.code && body.code !== 'SUCCESS') {
        return Promise.reject(new ApiError(body.code, body.message));
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
