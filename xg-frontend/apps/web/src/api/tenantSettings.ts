import api from './index';

export interface TenantSettings {
  tenant_id: string;
  /** 学校名称（即 tenant.name；登录页 / 顶栏 / 文档显示用）。 */
  school_name: string;
  /** 中文城市名。在 WeatherClient 白名单内才能查天气；不在也能保存。 */
  school_city: string | null;
}

export interface UpdateTenantSettingsPayload {
  /** null = 不改。空字符串会被后端校验拒绝（学校必须有名）。 */
  school_name?: string;
  /** null = 不改。空字符串清空。 */
  school_city?: string | null;
}

export function getTenantSettings(): Promise<TenantSettings> {
  return api.get('/system/tenant-settings').then((res) => res.data);
}

export function updateTenantSettings(payload: UpdateTenantSettingsPayload): Promise<TenantSettings> {
  return api.put('/system/tenant-settings', payload).then((res) => res.data);
}
