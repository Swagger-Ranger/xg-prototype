import { useMemo } from 'react';
import { Select, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listEmployerStaff } from '@/api/workStudy';

interface Props {
  /** 当前选中的用人单位 ID。未选时下拉禁用。 */
  employerId?: string | number | null;
  value?: string | number | null;
  onChange?: (v: string | undefined) => void;
  placeholder?: string;
}

/**
 * 「岗位负责人」选择器。跟随 employer_id 联动，列出该单位的 leader + operators，
 * 避免用户手填 user_id。后端 createPosition 已校验 owner 必须归属所选单位，本组件
 * 把候选集预过滤到合法范围，减少校验失败。
 */
export default function OwnerUserSelect({
  employerId, value, onChange,
  placeholder,
}: Props) {
  const eid = employerId != null ? String(employerId) : '';

  const q = useQuery({
    queryKey: ['employer-staff', eid],
    queryFn: () => listEmployerStaff(eid),
    enabled: !!eid,
    staleTime: 30_000,
  });

  const options = useMemo(
    () => (q.data ?? []).map((s) => ({
      label: `${s.name}（${s.role === 'leader' ? '负责人' : '操作员'}）`,
      value: String(s.user_id),
    })),
    [q.data],
  );

  const notFound = q.isFetching
    ? <Spin size="small" />
    : (q.data && q.data.length === 0 ? '该单位还没设置负责人 / 操作员，请先到「用人单位」补全' : null);

  return (
    <Select
      showSearch
      filterOption={(input, opt) => (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
      value={value != null ? String(value) : undefined}
      onChange={(v) => onChange?.(v ?? undefined)}
      options={options}
      allowClear
      disabled={!eid}
      placeholder={placeholder ?? (eid ? '从单位成员中选择' : '请先选择用人单位')}
      notFoundContent={notFound}
    />
  );
}
