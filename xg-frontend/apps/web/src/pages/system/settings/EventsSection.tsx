import { useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AcademicEvent,
  type AcademicEventUpsert,
  createEvent,
  deleteEvent,
  listEvents,
  listTerms,
  updateEvent,
} from '@/api/academic';
import { describeApiError } from '@/utils/api-error';

const EVENT_TYPE_OPTIONS = [
  { label: '期中考试', value: 'exam_midterm' },
  { label: '期末考试', value: 'exam_final' },
  { label: '假期', value: 'holiday' },
  { label: '其他', value: 'other' },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  exam_midterm: '期中考试',
  exam_final: '期末考试',
  holiday: '假期',
  other: '其他',
};

const GRANULARITY_OPTIONS = [
  { label: '精确到日', value: 'day' },
  { label: '粗到月（待定）', value: 'month' },
];

interface FormValues {
  term_code: string | null;
  event_type: string;
  name: string;
  range: [dayjs.Dayjs, dayjs.Dayjs];
  granularity: 'day' | 'month';
  notes?: string;
}

export default function EventsSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AcademicEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['academicEvents'],
    queryFn: () => listEvents(),
  });
  const { data: terms = [] } = useQuery({
    queryKey: ['academicTerms'],
    queryFn: listTerms,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['academicEvents'] });

  const createMut = useMutation({
    mutationFn: createEvent,
    onSuccess: () => { message.success('已创建'); setCreateOpen(false); form.resetFields(); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '创建失败')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AcademicEventUpsert }) => updateEvent(id, data),
    onSuccess: () => { message.success('已更新'); setEditing(null); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败')),
  });
  const deleteMut = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => { message.success('已删除'); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '删除失败')),
  });

  const openCreate = () => { form.resetFields(); setCreateOpen(true); };
  const openEdit = (e: AcademicEvent) => {
    form.setFieldsValue({
      term_code: e.term_code,
      event_type: e.event_type,
      name: e.name,
      range: [dayjs(e.start_date), dayjs(e.end_date)],
      granularity: e.granularity,
      notes: e.notes ?? undefined,
    });
    setEditing(e);
  };

  const handleSubmit = (values: FormValues) => {
    const payload: AcademicEventUpsert = {
      term_code: values.term_code || null,
      event_type: values.event_type,
      name: values.name.trim(),
      start_date: values.range[0].format('YYYY-MM-DD'),
      end_date: values.range[1].format('YYYY-MM-DD'),
      granularity: values.granularity,
      notes: values.notes?.trim() || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  const columns: ColumnsType<AcademicEvent> = [
    {
      title: '类型',
      dataIndex: 'event_type',
      width: 110,
      render: (v: string) => <Tag>{EVENT_TYPE_LABELS[v] ?? v}</Tag>,
    },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '关联学期', dataIndex: 'term_code', width: 130, render: (v) => v || '—' },
    {
      title: '日期',
      width: 240,
      render: (_, e) => {
        const range = `${dayjs(e.start_date).format('YYYY-MM-DD')} 至 ${dayjs(e.end_date).format('YYYY-MM-DD')}`;
        return e.granularity === 'month'
          ? <span>{dayjs(e.start_date).format('YYYY-MM')} <Tag color="default" style={{ marginLeft: 4 }}>月粒度</Tag></span>
          : range;
      },
    },
    { title: '备注', dataIndex: 'notes', ellipsis: true },
    {
      title: '操作',
      width: 120,
      render: (_, e) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEdit(e)}>编辑</Button>
          <Popconfirm title={`删除 ${e.name}?`} onConfirm={() => deleteMut.mutate(e.id)}>
            <Button size="small" type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const termOptions = [
    { label: '不关联学期', value: '' },
    ...terms.map((t) => ({ label: `${t.code} · ${t.name}`, value: t.code })),
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={openCreate}>新建事件</Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={events}
        loading={isLoading}
        pagination={false}
      />
      <Modal
        title={editing ? `编辑 ${editing.name}` : '新建事件'}
        open={createOpen || editing !== null}
        onCancel={() => { setCreateOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="event_type" label="类型" rules={[{ required: true }]} initialValue="holiday">
            <Select options={EVENT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="例：期末考试 / 寒假 / 国庆" />
          </Form.Item>
          <Form.Item name="term_code" label="关联学期">
            <Select options={termOptions} allowClear placeholder="跨学期可不选" />
          </Form.Item>
          <Form.Item name="granularity" label="日期粒度" rules={[{ required: true }]} initialValue="day">
            <Select options={GRANULARITY_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="range"
            label="开始 / 结束"
            rules={[{ required: true }]}
            extra="月粒度时只显示月份，UI 会标注'具体日期待定'"
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
