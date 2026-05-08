import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  message,
} from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  listFieldDefinitions,
  updateStudentExtendedInfo,
  type FieldDefinition,
} from '@/api/fieldDefinition';

type ExtendedInfo = Record<string, unknown> | null | undefined;

function renderValue(def: FieldDefinition, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (def.field_type === 'date' && typeof raw === 'string') {
    return dayjs(raw).isValid() ? dayjs(raw).format('YYYY-MM-DD') : String(raw);
  }
  return String(raw);
}

interface Props {
  studentId: string;
  extendedInfo: ExtendedInfo;
}

export default function ExtendedInfoSection({ studentId, extendedInfo }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['fieldDefinitions', 'enabled'],
    queryFn: () => listFieldDefinitions(true),
  });

  const enabledFields = useMemo(
    () => fields.filter((f) => f.enabled).sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  useEffect(() => {
    if (!editing) return;
    const initial: Record<string, unknown> = {};
    enabledFields.forEach((f) => {
      const v = (extendedInfo ?? {})[f.code];
      if (v === null || v === undefined) {
        initial[f.code] = undefined;
      } else if (f.field_type === 'date' && typeof v === 'string') {
        initial[f.code] = dayjs(v).isValid() ? dayjs(v) : undefined;
      } else {
        initial[f.code] = v;
      }
    });
    form.setFieldsValue(initial);
  }, [editing, enabledFields, extendedInfo, form]);

  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateStudentExtendedInfo(studentId, patch),
    onSuccess: () => {
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['student', studentId] });
      setEditing(false);
    },
    onError: (e: Error) => message.error(e.message || '保存失败'),
  });

  const onSubmit = async () => {
    const values = await form.validateFields();
    const patch: Record<string, unknown> = {};
    enabledFields.forEach((f) => {
      const raw = values[f.code];
      if (f.field_type === 'date') {
        patch[f.code] = raw ? (raw as dayjs.Dayjs).format('YYYY-MM-DD') : null;
      } else if (raw === undefined || raw === '') {
        patch[f.code] = null;
      } else {
        patch[f.code] = raw;
      }
    });
    mutation.mutate(patch);
  };

  if (isLoading) return <Spin size="small" />;
  if (enabledFields.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="管理员尚未配置扩展字段"
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
          编辑扩展信息
        </Button>
      </div>
      <Descriptions column={2} bordered size="small">
        {enabledFields.map((f) => (
          <Descriptions.Item key={f.code} label={f.label}>
            {renderValue(f, (extendedInfo ?? {})[f.code])}
          </Descriptions.Item>
        ))}
      </Descriptions>

      <Modal
        title="编辑扩展信息"
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={onSubmit}
        confirmLoading={mutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {enabledFields.map((f) => {
            const rules = f.required ? [{ required: true, message: `请填写${f.label}` }] : [];
            return (
              <Form.Item key={f.code} label={f.label} name={f.code} rules={rules}>
                {f.field_type === 'text' && <Input placeholder={f.placeholder ?? ''} />}
                {f.field_type === 'textarea' && <Input.TextArea rows={3} placeholder={f.placeholder ?? ''} />}
                {f.field_type === 'number' && <InputNumber style={{ width: '100%' }} placeholder={f.placeholder ?? ''} />}
                {f.field_type === 'date' && <DatePicker style={{ width: '100%' }} />}
                {f.field_type === 'select' && (
                  <Select
                    allowClear
                    placeholder={f.placeholder ?? '请选择'}
                    options={(f.options ?? []).map((o) => ({ label: o, value: o }))}
                  />
                )}
              </Form.Item>
            );
          })}
        </Form>
      </Modal>
    </>
  );
}
