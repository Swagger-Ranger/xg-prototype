import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  decideSalary,
  listSalaries,
  submitSalary,
  type SalarySubmit,
  type WorkStudySalary,
} from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';

const { TextArea } = Input;
const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '审批中',
  confirmed: '已确认',
  rejected: '已驳回',
  paid: '已支付',
};
const STATUS_COLOR: Record<string, string> = {
  draft: '#8c8c8c',
  pending: '#1677ff',
  confirmed: '#52c41a',
  rejected: '#ff4d4f',
  paid: '#722ed1',
};

const UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

export default function SalariesTab() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canReview = hasRole('aid_center_officer') || hasRole('student_affairs_officer') || hasRole('school_admin');

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decideRow, setDecideRow] = useState<WorkStudySalary | null>(null);
  const [decideAction, setDecideAction] = useState<'approve' | 'reject'>('approve');
  const [submitForm] = Form.useForm<SalarySubmit & { _month_str?: string }>();
  const [decideForm] = Form.useForm<{ note?: string }>();

  const query = useQuery({
    queryKey: ['salaries', page, statusFilter],
    queryFn: () => listSalaries({ page, size: PAGE_SIZE, status: statusFilter }),
  });

  const submitMut = useMutation({
    mutationFn: submitSalary,
    onSuccess: () => {
      message.success('已提交申报');
      setSubmitOpen(false);
      submitForm.resetFields();
      qc.invalidateQueries({ queryKey: ['salaries'] });
    },
    onError: (e) => message.error(describeApiError(e, '申报失败')),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      decideSalary(id, { action, note }),
    onSuccess: () => {
      message.success('已处理');
      setDecideRow(null);
      decideForm.resetFields();
      qc.invalidateQueries({ queryKey: ['salaries'] });
    },
    onError: (e) => message.error(describeApiError(e, '处理失败')),
  });

  const handleSubmit = () => {
    submitForm.validateFields().then((v) => {
      submitMut.mutate({
        application_id: String(v.application_id),
        month: String(v.month),
        units: String(v.units),
        report_note: v.report_note,
      });
    });
  };

  const handleDecide = () => {
    if (!decideRow) return;
    decideForm.validateFields().then((v) => {
      decideMut.mutate({ id: decideRow.id, action: decideAction, note: v.note });
    });
  };

  const columns: ColumnsType<WorkStudySalary> = [
    { title: '学生 ID', dataIndex: 'student_id', width: 100 },
    { title: '岗位 ID', dataIndex: 'position_id', width: 100 },
    {
      title: '岗位类型',
      dataIndex: 'position_type',
      width: 90,
      render: (v: string | null) =>
        v === 'fixed' ? <Tag color="blue">固定岗</Tag>
        : v === 'temporary' ? <Tag>临时岗</Tag>
        : <span style={{ color: 'var(--fg-4)' }}>—</span>,
    },
    { title: '月份', dataIndex: 'month', width: 90 },
    {
      title: '工作量',
      key: 'units',
      width: 110,
      render: (_, r) =>
        r.units && r.unit_type
          ? `${Number(r.units).toFixed(1)} ${UNIT_LABEL[r.unit_type] ?? r.unit_type}`
          : r.hours
          ? `${Number(r.hours).toFixed(1)} 时`
          : '—',
    },
    {
      title: '单价',
      key: 'rate',
      width: 110,
      render: (_, r) => {
        const rate = r.unit_rate ?? r.hourly_rate;
        const unit = r.unit_type ?? 'hour';
        return rate ? `¥${Number(rate).toFixed(2)} / ${UNIT_LABEL[unit] ?? '时'}` : '—';
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 110,
      render: (v: string) => <strong>¥{Number(v).toFixed(2)}</strong>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const c = STATUS_COLOR[v] ?? '#8c8c8c';
        return (
          <Tag style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}40` }}>
            {STATUS_LABEL[v] ?? v}
          </Tag>
        );
      },
    },
    {
      title: '申报于',
      dataIndex: 'created_at',
      width: 130,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, r) =>
        canReview && r.status === 'pending' ? (
          <>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setDecideRow(r);
                setDecideAction('approve');
                decideForm.resetFields();
              }}
            >
              通过
            </Button>
            <Button
              type="link"
              size="small"
              danger
              onClick={() => {
                setDecideRow(r);
                setDecideAction('reject');
                decideForm.resetFields();
              }}
            >
              驳回
            </Button>
          </>
        ) : (
          <span style={{ color: 'var(--fg-4)' }}>—</span>
        ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 160 }}
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        />
        <div style={{ flex: 1 }} />
        <Button type="primary" onClick={() => { setSubmitOpen(true); submitForm.resetFields(); }}>
          用工单位申报薪资
        </Button>
      </div>

      <Table<WorkStudySalary>
        rowKey="id"
        columns={columns}
        dataSource={query.data?.data ?? []}
        loading={query.isFetching}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: Number(query.data?.total ?? 0),
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
          size: 'small',
        }}
        size="middle"
      />

      <Modal
        title="用工单位申报薪资"
        open={submitOpen}
        onOk={handleSubmit}
        onCancel={() => { setSubmitOpen(false); submitForm.resetFields(); }}
        confirmLoading={submitMut.isPending}
        width={520}
      >
        <Form form={submitForm} layout="vertical" initialValues={{ month: dayjs().format('YYYY-MM') }}>
          <Form.Item
            label="申请 ID"
            name="application_id"
            rules={[{ required: true, message: '请输入对应的"已录用"申请 ID' }]}
            tooltip="必须是该学生在该岗位 status=hired 的申请"
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="月份"
            name="month"
            rules={[
              { required: true, message: '请填写月份' },
              { pattern: /^\d{4}-\d{2}$/, message: '形如 2026-04' },
            ]}
          >
            <Input placeholder="2026-04" />
          </Form.Item>
          <Form.Item
            label="工作量"
            name="units"
            rules={[{ required: true, message: '请填写工作量（按岗位单位计）' }]}
            tooltip="单位由岗位 salary_unit 决定（小时数 / 天数 / 月数 / 次数）"
          >
            <InputNumber min={0.01} step={0.5} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" name="report_note">
            <TextArea rows={3} maxLength={1000} placeholder="选填，描述本次薪资构成、特殊情况等" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={decideAction === 'approve' ? '确认通过薪资申报' : '驳回薪资申报'}
        open={decideRow !== null}
        onOk={handleDecide}
        onCancel={() => setDecideRow(null)}
        confirmLoading={decideMut.isPending}
        okText={decideAction === 'approve' ? '通过' : '驳回'}
        okButtonProps={decideAction === 'reject' ? { danger: true } : undefined}
      >
        {decideRow && (
          <>
            <p style={{ marginBottom: 12 }}>
              学生 #{decideRow.student_id} / 岗位 #{decideRow.position_id} / {decideRow.month}
              <br />
              金额 <strong>¥{Number(decideRow.amount).toFixed(2)}</strong>
            </p>
            <Form form={decideForm} layout="vertical">
              <Form.Item
                label={decideAction === 'approve' ? '审批意见' : '驳回理由'}
                name="note"
                rules={
                  decideAction === 'reject'
                    ? [{ required: true, message: '请填写驳回理由' }]
                    : undefined
                }
              >
                <TextArea
                  rows={3}
                  maxLength={2000}
                  placeholder={decideAction === 'approve' ? '选填' : '让用工单位知道为什么被驳回'}
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
