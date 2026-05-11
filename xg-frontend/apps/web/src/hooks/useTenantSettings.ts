import { useQuery } from '@tanstack/react-query';
import { getTenantSettings, type TenantSettings } from '@/api/tenantSettings';

/**
 * 单点拉租户设置。tenantSettings 全站缓存共用 ['tenantSettings'] key,
 * SchoolInfoSection 写入后会 invalidate,所有消费方自动跟。
 */
export function useTenantSettings() {
  return useQuery<TenantSettings>({
    queryKey: ['tenantSettings'],
    queryFn: getTenantSettings,
    staleTime: 60_000,
  });
}

/**
 * 书院制是否启用。所有书院相关 UI(入口、列、筛选、页面)统一拉这个 hook,
 * 关闭时直接 return null 软隐藏。后端数据不动,再开就回来。
 */
export function useResidentialEnabled(): boolean {
  const { data } = useTenantSettings();
  return data?.enable_residential_track ?? false;
}
