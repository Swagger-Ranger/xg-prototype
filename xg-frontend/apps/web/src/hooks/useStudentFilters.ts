import { useCallback, useMemo, useState } from 'react';
import type { FieldCatalogResponse, FieldDef } from '@/api/fieldCatalog';
import type { TenantSettings } from '@/api/tenantSettings';

/**
 * 学生页过滤器的统一状态机。9 个独立 useState 收成一个 Record<string,string>。
 * 加新字段 = 改 yaml 一处,这里不动。
 *
 * 行为约束(必须和原页面对齐,UI 样式 + 行为不能变):
 *   - 父级清空 → 子级一并清空 (college 清 → major / className 也清)
 *   - tenant_setting 没开 → 该字段从不参与 (state 永远空,values 也不出)
 *   - applyAll = AI action 来时整批替换,空 / 缺失视作清空
 *
 * 返回 values 给后端 query (PageQuery 之外的部分),给 chip 高亮判断,给 activeFilters 渲染。
 */
export interface StudentFilters {
  values: Record<string, string>;
  set(key: string, value: string): void;
  clearOne(key: string): void;
  clearAll(): void;
  /** AI action 来时整批 reset,values 全替换为传入 dict 中的值,缺失字段清空。 */
  applyAll(next: Record<string, unknown> | null | undefined): void;
}

export function useStudentFilters(
  catalog: FieldCatalogResponse | undefined,
  tenantSettings: TenantSettings | undefined,
  onAfterChange?: () => void,
): StudentFilters {
  const [values, setValues] = useState<Record<string, string>>({});

  const fieldsByKey = useMemo(() => {
    const m = new Map<string, FieldDef>();
    catalog?.fields?.forEach((f) => m.set(f.key, f));
    return m;
  }, [catalog]);

  /** 字段是否对当前租户可见(tenant_setting 没开 = 不可见,值始终空)。 */
  const isVisible = useCallback(
    (f: FieldDef): boolean => {
      if (!f.tenant_setting) return true;
      const ts = tenantSettings as Record<string, unknown> | undefined;
      return Boolean(ts?.[f.tenant_setting]);
    },
    [tenantSettings],
  );

  /** 子集 = 这个字段(及其所有后代)的 key 列表,用于级联清空 / 父级隐藏时一起置空。 */
  const descendantsOf = useCallback(
    (parentKey: string): string[] => {
      const out: string[] = [];
      const visit = (k: string) => {
        catalog?.fields?.forEach((f) => {
          if (f.parent === k) {
            out.push(f.key);
            visit(f.key);
          }
        });
      };
      visit(parentKey);
      return out;
    },
    [catalog],
  );

  const set = useCallback(
    (key: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        // 父级换了 / 清空了 → 后代全清,行为对齐原 setFilterCollege 后手动清子级。
        descendantsOf(key).forEach((k) => {
          next[k] = '';
        });
        return next;
      });
      onAfterChange?.();
    },
    [descendantsOf, onAfterChange],
  );

  const clearOne = useCallback(
    (key: string) => set(key, ''),
    [set],
  );

  const clearAll = useCallback(() => {
    setValues({});
    onAfterChange?.();
  }, [onAfterChange]);

  const applyAll = useCallback(
    (next: Record<string, unknown> | null | undefined) => {
      const fresh: Record<string, string> = {};
      catalog?.fields?.forEach((f) => {
        if (!isVisible(f)) return;
        const raw = next?.[f.key];
        fresh[f.key] = typeof raw === 'string' ? raw : '';
      });
      setValues(fresh);
      onAfterChange?.();
    },
    [catalog, isVisible, onAfterChange],
  );

  // 暴露给消费方时,过滤掉对当前租户不可见的字段(永远是空,但展示 / 后端 query 里不应该出现)。
  const visibleValues = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => {
      const f = fieldsByKey.get(k);
      if (f && !isVisible(f)) return;
      if (v) out[k] = v;
    });
    return out;
  }, [values, fieldsByKey, isVisible]);

  return { values: visibleValues, set, clearOne, clearAll, applyAll };
}
