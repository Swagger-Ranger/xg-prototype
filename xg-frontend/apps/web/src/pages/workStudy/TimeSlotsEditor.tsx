import { Button, Form, Select, TimePicker } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { TimeSlot } from '@/api/workStudy';

const DAY_OPTIONS = [
  { label: '周一', value: 'mon' },
  { label: '周二', value: 'tue' },
  { label: '周三', value: 'wed' },
  { label: '周四', value: 'thu' },
  { label: '周五', value: 'fri' },
  { label: '周六', value: 'sat' },
  { label: '周日', value: 'sun' },
];

/**
 * Antd Form 控件值约定：内部用 `{day, start: Dayjs, end: Dayjs}`，
 * 由 toApi/fromApi 在外层转换为后端的 `{day, start: 'HH:MM', end: 'HH:MM'}`。
 */
export interface TimeSlotFormValue {
  day?: TimeSlot['day'];
  start?: Dayjs;
  end?: Dayjs;
}

export function timeSlotsToApi(values: TimeSlotFormValue[] | undefined): TimeSlot[] | undefined {
  if (!values || values.length === 0) return undefined;
  const out: TimeSlot[] = [];
  for (const v of values) {
    if (!v?.day || !v.start || !v.end) continue;
    out.push({
      day: v.day,
      start: v.start.format('HH:mm'),
      end: v.end.format('HH:mm'),
    });
  }
  return out.length ? out : undefined;
}

export function timeSlotsFromApi(raw: TimeSlot[] | string | null | undefined): TimeSlotFormValue[] {
  if (!raw) return [];
  let arr: TimeSlot[];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => s?.day && s.start && s.end)
    .map((s) => ({
      day: s.day,
      start: dayjs(s.start, 'HH:mm'),
      end: dayjs(s.end, 'HH:mm'),
    }));
}

export default function TimeSlotsEditor({ name }: { name: string }) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map((field) => (
            <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Form.Item
                {...field}
                name={[field.name, 'day']}
                style={{ marginBottom: 0, flex: '0 0 110px' }}
                rules={[{ required: true, message: '选周几' }]}
              >
                <Select options={DAY_OPTIONS} placeholder="周几" />
              </Form.Item>
              <Form.Item
                {...field}
                name={[field.name, 'start']}
                style={{ marginBottom: 0, flex: 1 }}
                rules={[{ required: true, message: '开始' }]}
              >
                <TimePicker format="HH:mm" minuteStep={5} placeholder="开始" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                {...field}
                name={[field.name, 'end']}
                style={{ marginBottom: 0, flex: 1 }}
                rules={[{ required: true, message: '结束' }]}
              >
                <TimePicker format="HH:mm" minuteStep={5} placeholder="结束" style={{ width: '100%' }} />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => add({ day: 'mon' })}
            style={{ width: '100%' }}
          >
            添加时间段
          </Button>
        </div>
      )}
    </Form.List>
  );
}
