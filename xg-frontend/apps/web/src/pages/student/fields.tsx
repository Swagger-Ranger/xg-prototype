import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFieldDefinition,
  deleteFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  type FieldDefinition,
  type FieldDefinitionPayload,
  type FieldType,
} from '@/api/fieldDefinition';

const TYPE_LABELS: Record<FieldType, string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  select: '下拉',
  textarea: '多行文本',
};

interface FormValues {
  code: string;
  label: string;
  field_type: FieldType;
  options?: string;
  placeholder?: string;
  required?: boolean;
  sort_order?: number;
  enabled?: boolean;
}

export default function FieldDefinitionManagement() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const typeWatch = Form.useWatch('field_type', form);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fieldDefinitions', 'all'],
    queryFn: () => listFieldDefinitions(false),
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        code: editing.code,
        label: editing.label,
        field_type: editing.field_type,
        options: (editing.options ?? []).join(','),
        placeholder: editing.placeholder ?? '',
        required: editing.required,
        sort_order: editing.sort_order,
        enabled: editing.enabled,
      });
    } else {
      form.setFieldsValue({
        code: '',
        label: '',
        field_type: 'text',
        options: '',
        placeholder: '',
        required: false,
        sort_order: 0,
        enabled: true,
      });
    }
  }, [open, editing, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: FieldDefinitionPayload = {
        code: values.code,
        label: values.label,
        field_type: values.field_type,
        placeholder: values.placeholder || null,
        required: !!values.required,
        sort_order: values.sort_order ?? 0,
        enabled: values.enabled ?? true,
        options:
          values.field_type === 'select'
            ? (values.options ?? '')
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : null,
      };
      if (editing) return updateFieldDefinition(editing.id, payload);
      return createFieldDefinition(payload);
    },
    onSuccess: () => {
      message.success(editing ? '已更新' : '已新增');
      qc.invalidateQueries({ queryKey: ['fieldDefinitions'] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => message.error(e.message || '保存失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFieldDefinition(id),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['fieldDefinitions'] });
    },
    onError: (e: Error) => message.error(e.message || '删除失败'),
  });

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (values.field_type === 'select') {
      const opts = (values.options ?? '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        message.error('下拉类型至少需要一个可选项');
        return;
      }
    }
    saveMutation.mutate(values);
  };

  const columns: ColumnsType<FieldDefinition> = [
    { title: '排序', dataIndex: 'sort_order', width: 70 },
    { title: '字段编码', dataIndex: 'code', width: 140, render: (v) => <code>{v}</code> },
    { title: '字段名称', dataIndex: 'label', width: 140 },
    {
      title: '类型',
      dataIndex: 'field_type',
      width: 90,
      render: (v: FieldType) => <Tag>{TYPE_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '可选项',
      dataIndex: 'options',
      render: (v: string[] | null) => (v && v.length ? v.join(' / ') : '—'),
    },
    {
      title: '必填',
      dataIndex: 'required',
      width: 70,
      render: (v: boolean) => (v ? <Tag color="red">是</Tag> : '—'),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 70,
      render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setEditing(row);
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该字段？"
            description="历史存入的数据不会删除，但界面将不再展示。"
            onConfirm={() => deleteMutation.mutate(row.id)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      <button
        onClick={() => navigate('/student')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 13,
          color: 'var(--fg-3)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 12,
        }}
      >
        <ArrowLeftOutlined /> 返回学生信息库
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>学生扩展字段管理</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 4 }}>
            这里配置的字段会出现在学生画像的"扩展信息"Tab 下。数据存在 student_profile.extended_info JSONB 列。
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          新增字段
        </Button>
      </div>

      <Table<FieldDefinition>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isLoading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editing ? '编辑字段' : '新增字段'}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={onSubmit}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label="字段编码"
            name="code"
            rules={[
              { required: true, message: '请输入字段编码' },
              { pattern: /^[a-z][a-z0-9_]{1,62}$/, message: '小写字母开头，可含数字/下划线' },
            ]}
            extra="存入 extended_info JSONB 的 key，创建后不可修改"
          >
            <Input disabled={!!editing} placeholder="例如 hobby" />
          </Form.Item>
          <Form.Item label="字段名称" name="label" rules={[{ required: true, message: '请输入字段名称' }]}>
            <Input placeholder="例如 兴趣爱好" />
          </Form.Item>
          <Form.Item label="类型" name="field_type" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(TYPE_LABELS) as FieldType[]).map((k) => ({
                value: k,
                label: TYPE_LABELS[k],
              }))}
            />
          </Form.Item>
          {typeWatch === 'select' && (
            <Form.Item label="可选项" name="options" extra="多个选项用英文逗号分隔">
              <Input placeholder="A,B,AB,O,未知" />
            </Form.Item>
          )}
          <Form.Item label="占位提示" name="placeholder">
            <Input placeholder="输入框灰字提示，可选" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item label="排序" name="sort_order">
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <Form.Item label="必填" name="required" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
