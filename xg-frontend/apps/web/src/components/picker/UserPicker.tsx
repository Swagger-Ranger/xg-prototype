import { Select, Spin } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers, type SystemUser } from '@/api/system';

const ROLE_LABEL: Record<string, string> = {
  student: '学生',
  counselor: '辅导员',
  college_admin: '院系管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  employer: '用工单位',
  aid_center_officer: '资助中心',
};

export type PickedUser = Pick<SystemUser, 'id' | 'username' | 'real_name' | 'phone' | 'email' | 'role_codes'>;

export interface UserPickerProps {
  /** Single-mode: a user id string. Multi-mode: an array of ids. */
  value?: string | string[];
  onChange?: (v: string | string[] | undefined) => void;
  /**
   * Single-mode only: fires when the user picks an option. Receives the full
   * user record (so the caller can autofill related fields like phone/email)
   * or null when the value is cleared. Not invoked for programmatic
   * setFieldsValue — only on actual selection events.
   */
  onUserSelect?: (user: PickedUser | null) => void;
  /** Multi-select. Default false. */
  multiple?: boolean;
  /**
   * Pre-filter the candidate pool to a set of role codes — when picking an
   * "employer leader" we usually only want managerial roles, not students.
   * Pass undefined to allow all roles.
   */
  roleCodes?: string[];
  placeholder?: string;
  disabled?: boolean;
  /**
   * Optional pre-seeded user records so initial value can render its name in
   * edit mode even before the search query has fetched the user. Caller passes
   * the user objects it already has loaded (e.g. the Employer's leader plus
   * known operators).
   */
  seedUsers?: PickedUser[];
  style?: React.CSSProperties;
}

function userLabel(u: Pick<SystemUser, 'username' | 'real_name' | 'role_codes'>): string {
  const role = u.role_codes?.[0];
  const roleZh = role ? ROLE_LABEL[role] ?? role : '';
  const head = u.real_name ? `${u.real_name}（${u.username}）` : u.username;
  return roleZh ? `${head} · ${roleZh}` : head;
}

export default function UserPicker({
  value, onChange, onUserSelect, multiple = false, roleCodes,
  placeholder, disabled, seedUsers = [], style,
}: UserPickerProps) {
  const [keyword, setKeyword] = useState('');

  // Debounce typing → triggers query refetch via key.
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebounced(keyword), 250);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [keyword]);

  // Backend `role_code` is single-valued; when caller wants several roles we
  // fan out one query per role and merge. The typical case (managerial roles)
  // is 4-5 codes, so the tiny request fan-out is fine.
  const queries = useQuery<SystemUser[]>({
    queryKey: ['user-picker', roleCodes?.join(',') || '_any', debounced],
    queryFn: async () => {
      if (!roleCodes || roleCodes.length === 0) {
        const r = await getUsers({ page: 1, size: 50, keyword: debounced || undefined });
        return r.data;
      }
      const all = await Promise.all(
        roleCodes.map((rc) =>
          getUsers({ page: 1, size: 50, roleCode: rc, keyword: debounced || undefined })
        )
      );
      // Dedupe by id (a user with multiple roles would appear in several lists).
      const byId = new Map<string, SystemUser>();
      for (const r of all) for (const u of r.data) byId.set(u.id, u);
      return Array.from(byId.values());
    },
    // v5 react-query keeps previous data via placeholderData.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  // Merge seed users (carries name for the initial value in edit mode) with
  // search results, dedup by id, with seeds first so they appear at top.
  const merged = useMemo(() => {
    const map = new Map<string, PickedUser>();
    for (const u of seedUsers) map.set(u.id, u);
    for (const u of (queries.data ?? [])) map.set(u.id, u);
    return Array.from(map.values());
  }, [seedUsers, queries.data]);

  const options = merged.map((u) => ({
    value: u.id,
    label: userLabel(u),
  }));

  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      value={value as never}
      onChange={(v) => {
        const next = v as string | string[] | undefined;
        onChange?.(next);
        if (!multiple && onUserSelect) {
          if (typeof next === 'string' && next) {
            onUserSelect(merged.find((u) => u.id === next) ?? null);
          } else {
            onUserSelect(null);
          }
        }
      }}
      placeholder={placeholder ?? (multiple ? '搜姓名 / 账号，可选多个' : '搜姓名 / 账号')}
      showSearch
      filterOption={false}
      onSearch={setKeyword}
      onBlur={() => setKeyword('')}
      notFoundContent={queries.isFetching ? <Spin size="small" /> : '没找到，换个关键词'}
      options={options}
      disabled={disabled}
      allowClear
      style={style}
      // Keep search box reactive but don't drop the typed query when the
      // dropdown re-renders mid-fetch.
      optionFilterProp="label"
    />
  );
}
