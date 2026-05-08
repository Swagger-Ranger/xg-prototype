// Cascader-backed input that emits a flat string (the leaf city name) so
// existing form_data callers don't need to know about the two-level path.
// Designed to be plugged into antd Form via standard value/onChange protocol.
import { useMemo, useState } from 'react';
import { Alert, Cascader, Input, Space } from 'antd';
import { CASCADER_OPTIONS, matchCityPath } from './china-cities';

interface Props {
  value?: string;
  onChange?: (next: string | undefined) => void;
  placeholder?: string;
  allowClear?: boolean;
}

export default function CityCascaderField({ value, onChange, placeholder, allowClear }: Props) {
  // Resolve the incoming string into a Cascader path. If we can't (e.g.
  // legacy "北京市海淀区" with district info), fall back to a plain text
  // input + a small notice telling the user the original was preserved.
  const matched = useMemo(() => (value ? matchCityPath(value) : null), [value]);
  const [forceText, setForceText] = useState(false);

  // legacy / unmatched value → keep original text, let user re-pick
  if (value && !matched && !forceText) {
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        <Alert
          type="warning"
          showIcon
          banner
          message={
            <span style={{ fontSize: 12 }}>
              原值「{value}」含区县或非标准地名，无法对应到省/市级联，已保留为文本。
            </span>
          }
          action={
            <a
              onClick={() => {
                onChange?.(undefined);
                setForceText(false);
              }}
              style={{ fontSize: 12 }}
            >
              重选
            </a>
          }
        />
        <Input
          value={value}
          placeholder={placeholder ?? '目的地'}
          onChange={(e) => onChange?.(e.target.value || undefined)}
          allowClear
        />
      </Space>
    );
  }

  return (
    <Cascader
      style={{ width: '100%' }}
      options={CASCADER_OPTIONS}
      value={matched ?? undefined}
      placeholder={placeholder ?? '请选择省/市'}
      allowClear={allowClear !== false}
      showSearch={{
        // Filter shows both province and city by either label
        filter: (input, path) =>
          path.some((opt) =>
            (opt.label as string).toLowerCase().includes(input.toLowerCase()),
          ),
      }}
      onChange={(picked) => {
        if (!picked || picked.length === 0) {
          onChange?.(undefined);
          return;
        }
        // Emit only the leaf (city) string — that's what gets stored.
        const leaf = String(picked[picked.length - 1]);
        onChange?.(leaf);
      }}
    />
  );
}
