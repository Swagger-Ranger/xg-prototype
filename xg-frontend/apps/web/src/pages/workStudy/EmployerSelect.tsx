import { useEffect, useMemo, useState } from 'react';
import { Select, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listEmployers } from '@/api/workStudy';

interface Props {
  value?: string | number | null;
  onChange?: (v: string | undefined) => void;
  allowClear?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

/**
 * Async-search Employer picker. Initial state shows the first 50 active
 * employers; user typing triggers a keyword query (debounced 300ms via
 * react-query staleTime).
 */
export default function EmployerSelect({
  value, onChange, allowClear = true, placeholder = '选择用人单位', style,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  const q = useQuery({
    queryKey: ['employer-options', debounced],
    queryFn: () => listEmployers({ page: 1, size: 50, keyword: debounced || undefined, status: 'active' }),
    staleTime: 30_000,
  });

  const options = useMemo(
    () => (q.data?.data ?? []).map((e) => ({
      label: `${e.name}（#${e.id}）`,
      value: String(e.id),
    })),
    [q.data?.data],
  );

  return (
    <Select
      showSearch
      filterOption={false}
      onSearch={setKeyword}
      value={value != null ? String(value) : undefined}
      onChange={(v) => onChange?.(v ?? undefined)}
      options={options}
      allowClear={allowClear}
      placeholder={placeholder}
      style={style}
      notFoundContent={q.isFetching ? <Spin size="small" /> : null}
    />
  );
}
