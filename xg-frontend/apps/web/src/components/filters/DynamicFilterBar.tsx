import { useMemo } from 'react';
import { Input } from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '@/api';
import type { FieldDef, FieldCatalogResponse } from '@/api/fieldCatalog';
import type { TenantSettings } from '@/api/tenantSettings';
import styles from '@/pages/student/index.module.css';

/**
 * 字段目录驱动的过滤栏。catalog 里每条 field 渲染一行 chip / 一个搜索框。
 * 行为约束(必须和原 student/index.tsx 手写版对齐):
 *   - 父级 (FieldDef.parent) 没值 → 子级整行不渲染 (e.g. 没选学院就不出专业)
 *   - 租户 tenant_setting 没开 → 整行不渲染 (e.g. 单轨学校不出书院)
 *   - 静态枚举:catalog.options 直接 chip 出来
 *   - 级联静态:catalog.cascading_static.groups[父级值] 取子集,父级未选 → 平铺合集
 *   - 动态:catalog.dynamic.url 调一次,scoped_by 透传父级值
 *   - 搜索框 (type=text) 走 Input.Search,Enter / 清空都走 onChange
 *
 * 视觉用 student/index.module.css 里的 filterRow / chip 样式 — 不引入新主题。
 */
interface Props {
  catalog: FieldCatalogResponse;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  tenantSettings: TenantSettings | undefined;
}

export default function DynamicFilterBar({ catalog, values, onChange, tenantSettings }: Props) {
  return (
    <>
      {catalog.fields.map((f) => (
        <FilterField
          key={f.key}
          field={f}
          values={values}
          onChange={onChange}
          tenantSettings={tenantSettings}
        />
      ))}
    </>
  );
}

function FilterField({
  field,
  values,
  onChange,
  tenantSettings,
}: {
  field: FieldDef;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  tenantSettings: TenantSettings | undefined;
}) {
  // 租户开关门控 (e.g. enable_residential_track=false → 书院/楼栋整行隐藏)
  if (field.tenant_setting) {
    const ts = tenantSettings as Record<string, unknown> | undefined;
    if (!ts?.[field.tenant_setting]) return null;
  }
  // 父级没值 → 子级不出现 (班级要求选了专业,楼栋要求选了书院)
  if (field.parent && !values[field.parent]) return null;

  if (field.type === 'text') {
    return <TextFilter field={field} value={values[field.key] || ''} onChange={onChange} />;
  }

  // 静态优先,然后级联静态,最后动态
  if (field.options && field.options.length > 0) {
    return (
      <ChipRow
        field={field}
        value={values[field.key] || ''}
        options={field.options}
        onChange={onChange}
      />
    );
  }
  if (field.cascading_static) {
    return (
      <CascadingStaticFilter
        field={field}
        values={values}
        onChange={onChange}
      />
    );
  }
  if (field.dynamic?.url) {
    return (
      <DynamicEnumFilter
        field={field}
        values={values}
        onChange={onChange}
      />
    );
  }
  return null;  // 不该发生:catalog 解析期已经校验过 yaml,这里只是保底
}

function TextFilter({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className={styles.filterRow}>
      <span className={styles.filterRowLabel}>搜索</span>
      <div className={styles.filterRowValues}>
        <Input.Search
          placeholder={field.description?.split(';')[0] ?? '学号或姓名'}
          allowClear
          style={{ width: 240 }}
          defaultValue={value}
          onSearch={(v) => onChange(field.key, v)}
          onChange={(e) => {
            if (!e.target.value) onChange(field.key, '');
          }}
        />
      </div>
    </div>
  );
}

function ChipRow({
  field,
  value,
  options,
  onChange,
}: {
  field: FieldDef;
  value: string;
  options: { value: string; label: string }[];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className={styles.filterRow}>
      <span className={styles.filterRowLabel}>{field.label}</span>
      <div className={styles.filterRowValues}>
        <Chip active={!value} onClick={() => onChange(field.key, '')}>
          {`全部${field.label}`}
        </Chip>
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            onClick={() => onChange(field.key, opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function CascadingStaticFilter({
  field,
  values,
  onChange,
}: {
  field: FieldDef;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const cs = field.cascading_static!;
  const opts = useMemo(() => {
    const parentVal = values[cs.parent_key];
    if (parentVal && cs.groups[parentVal]) {
      return cs.groups[parentVal].map((v) => ({ value: v, label: v }));
    }
    // 父级未选 → 全部 group 扁平合集 (与原 majorOptions 行为一致)
    const flat = Array.from(new Set(Object.values(cs.groups).flat()));
    return flat.map((v) => ({ value: v, label: v }));
  }, [cs, values]);

  return <ChipRow field={field} value={values[field.key] || ''} options={opts} onChange={onChange} />;
}

function DynamicEnumFilter({
  field,
  values,
  onChange,
}: {
  field: FieldDef;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const dyn = field.dynamic!;
  const params = useMemo(() => {
    const out: Record<string, string> = {};
    (dyn.scoped_by ?? []).forEach((k) => {
      if (values[k]) out[k] = values[k];
    });
    return out;
  }, [dyn, values]);

  const { data } = useQuery<unknown>({
    // queryKey 显式 stringify params 以保证 deep-equal 命中缓存
    queryKey: ['fieldOptions', field.key, dyn.url, JSON.stringify(params)],
    queryFn: () => api.get(dyn.url!, { params }).then((r) => r.data),
    staleTime: 60 * 1000,
  });

  const opts = useMemo(() => {
    // dynamic.key='$root' → 后端直接返回数组;否则后端返回对象,从对象的 key 字段取数组
    let raw: unknown;
    if (!dyn.key || dyn.key === '$root') {
      raw = data;
    } else if (data && typeof data === 'object') {
      raw = (data as Record<string, unknown>)[dyn.key];
    }
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .filter((v): v is string => typeof v === 'string')
      .map((v) => ({ value: v, label: v }));
  }, [data, dyn.key]);

  return <ChipRow field={field} value={values[field.key] || ''} options={opts} onChange={onChange} />;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
