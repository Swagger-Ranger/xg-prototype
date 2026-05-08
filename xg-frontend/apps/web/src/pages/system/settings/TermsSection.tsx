import { useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DatePicker } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AcademicTerm,
  type AcademicTermUpsert,
  createTerm,
  deleteTerm,
  listTerms,
  setCurrentTerm,
  updateTerm,
} from '@/api/academic';
import { describeApiError } from '@/utils/api-error';

interface FormValues {
  code: string;
  name: string;
  range: [dayjs.Dayjs, dayjs.Dayjs];
  total_weeks: number;
  is_current: boolean;
}

export default function TermsSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AcademicTerm | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['academicTerms'],
    queryFn: listTerms,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['academicTerms'] });

  const createMut = useMutation({
    mutationFn: createTerm,
    onSuccess: () => { message.success('已创建'); setCreateOpen(false); form.resetFields(); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '创建失败')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AcademicTermUpsert }) => updateTerm(id, data),
    onSuccess: () => { message.success('已更新'); setEditing(null); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败')),
  });
  const deleteMut = useMutation({
    mutationFn: deleteTerm,
    onSuccess: () => { message.success('已删除'); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '删除失败')),
  });
  const setCurrentMut = useMutation({
    mutationFn: setCurrentTerm,
    onSuccess: () => { message.success('已切换当前学期'); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '切换失败')),
  });

  const openCreate = () => {
    form.resetFields();
    setCreateOpen(true);
  };

  const openEdit = (t: AcademicTerm) => {
    form.setFieldsValue({
      code: t.code,
      name: t.name,
      range: [dayjs(t.start_date), dayjs(t.end_date)],
      total_weeks: t.total_weeks,
      is_current: t.is_current,
    });
    setEditing(t);
  };

  // Keep form-state and selected row in sync when popup opens.
  useEffect(() => {
    if (!editing && !createOpen) form.resetFields();
  }, [editing, createOpen, form]);

  const handleSubmit = (values: FormValues) => {
    const payload: AcademicTermUpsert = {
      code: values.code.trim(),
      name: values.name.trim(),
      start_date: values.range[0].format('YYYY-MM-DD'),
      end_date: values.range[1].format('YYYY-MM-DD'),
      total_weeks: values.total_weeks,
      is_current: values.is_current,
    };
    if (editing) updateMut.mutate({ id: editing.id, data: payload });
    else createMut.mutate(payload);
  };

  const columns: ColumnsType<AcademicTerm> = [
    { title: '学期标识', dataIndex: 'code', width: 130 },
    { title: '名称', dataIndex: 'name' },
    {
      title: '日期',
      width: 220,
      render: (_, t) =>
        `${dayjs(t.start_date).format('YYYY-MM-DD')} 至 ${dayjs(t.end_date).format('YYYY-MM-DD')}`,
    },
    { title: '总周数', dataIndex: 'total_weeks', width: 80 },
    {
      title: '当前学期',
      dataIndex: 'is_current',
      width: 100,
      render: (v: boolean, t) =>
        v ? (
          <Tag color="success">当前</Tag>
        ) : (
          <Button size="small" type="link" onClick={() => setCurrentMut.mutate(t.id)}>
            设为当前
          </Button>
        ),
    },
    {
      title: '操作',
      width: 160,
      render: (_, t) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEdit(t)}>编辑</Button>
          <Popconfirm
            title={`删除 ${t.code}?`}
            description="当前学期不可删除"
            disabled={t.is_current}
            onConfirm={() => deleteMut.mutate(t.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" type="link" danger disabled={t.is_current}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={openCreate}>新建学期</Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={terms}
        loading={isLoading}
        pagination={false}
      />
      <Modal
        title={editing ? `编辑 ${editing.code}` : '新建学期'}
        open={createOpen || editing !== null}
        onCancel={() => { setCreateOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={(changed, all) => {
            // Auto-suggest 学期标识 based on the start date the moment the
            // user picks dates, so they don't have to remember the format.
            // Only suggests when the user hasn't typed a code themselves.
            if (changed.range && !all.code && Array.isArray(changed.range) && changed.range[0]) {
              const startMonth = (changed.range[0] as dayjs.Dayjs).month() + 1;  // 1-12
              const startYear = (changed.range[0] as dayjs.Dayjs).year();
              // Convention: 8 月以后 = 秋季新学年第 1 学期；否则 = 上一学年第 2 学期。
              const suggested = startMonth >= 8
                ? `${startYear}-${startYear + 1}-1`
                : `${startYear - 1}-${startYear}-2`;
              form.setFieldsValue({ code: suggested });
            }
          }}
        >
          <Form.Item
            name="range"
            label="开学 / 结束"
            rules={[{ required: true, message: '请选择起止日期' }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="code"
            label="学期标识"
            rules={[{ required: true, message: '请填写学期标识' }]}
            extra="格式 学年-学年-学期序号，例如 2025-2026-2 表示 2025-2026 学年第二学期。选完日期后会自动填，需要时可改"
          >
            <Input placeholder="2025-2026-2" />
          </Form.Item>
          <Form.Item name="name" label="学期名称" rules={[{ required: true }]}>
            <Input placeholder="2025-2026 学年第二学期" />
          </Form.Item>
          <Form.Item
            name="total_weeks"
            label="教学周数（兜底）"
            rules={[{ required: true }]}
            initialValue={20}
            extra={
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                校园页"第几周 / 总周数"实际按"考试与假期"页配置的<b>期末考试 + 假期</b>事件倒推。
                本字段仅作为 fallback：未配置期末考试事件时使用。
              </span>
            }
          >
            <InputNumber min={1} max={60} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_current" label="设为当前学期" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
