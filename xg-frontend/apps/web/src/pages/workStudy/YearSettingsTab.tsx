import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  listYearSettings,
  syncPositionsFromYear,
  upsertYearSetting,
  type WorkStudyYearSetting,
  type YearSettingUpsert,
} from '@/api/workStudy';

export default function YearSettingsTab() {
  const qc = useQueryClient();

  const [editing, setEditing] = useState<WorkStudyYearSetting | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [syncTarget, setSyncTarget] = useState<WorkStudyYearSetting | null>(null);
  const [form] = Form.useForm<YearSettingUpsert>();
  const [syncForm] = Form.useForm<{ from_year: string }>();

  const query = useQuery({
    queryKey: ['yearSettings'],
    queryFn: listYearSettings,
  });

  const upsertMut = useMutation({
    mutationFn: upsertYearSetting,
    onSuccess: () => {
      message.success('已保存');
      setCreateOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['yearSettings'] });
    },
    onError: (e) => message.error(describeApiError(e, '保存失败')),
  });

  const syncMut = useMutation({
    mutationFn: ({ toYear, fromYear }: { toYear: string; fromYear: string }) =>
      syncPositionsFromYear(toYear, fromYear),
    onSuccess: (res) => {
      message.success(`已复制 ${res.copied} 条岗位（${res.fromYear} → ${res.toYear}），新岗位状态为草稿`);
      setSyncTarget(null);
      syncForm.resetFields();
    },
    onError: (e) => message.error(describeApiError(e, '同步失败')),
  });

  const openEdit = (s: WorkStudyYearSetting) => {
    setEditing(s);
    form.setFieldsValue({
      academic_year: s.academic_year,
      max_fixed_per_student: s.max_fixed_per_student,
      max_temp_per_student: s.max_temp_per_student,
      application_open: s.application_open,
      default_allow_self_arrange: s.default_allow_self_arrange,
    });
  };

  const submit = () => {
    form.validateFields().then((v) => upsertMut.mutate(v));
  };

  const submitSync = () => {
    if (!syncTarget) return;
    syncForm.validateFields().then((v) => {
      syncMut.mutate({ toYear: syncTarget.academic_year, fromYear: v.from_year });
    });
  };

  const columns: ColumnsType<WorkStudyYearSetting> = [
    { title: '学年', dataIndex: 'academic_year', width: 130 },
    {
      title: '固定岗上限',
      dataIndex: 'max_fixed_per_student',
      width: 110,
      render: (v: number) => `${v} 个 / 学生`,
    },
    {
      title: '临时岗上限',
      dataIndex: 'max_temp_per_student',
      width: 110,
      render: (v: number) => `${v} 个 / 学生`,
    },
    {
      title: '开放申请',
      dataIndex: 'application_open',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="green">已开放</Tag> : <Tag>未开放</Tag>),
    },
    {
      title: '默认允许内部安排',
      dataIndex: 'default_allow_self_arrange',
      width: 140,
      render: (v: boolean) => (v ? <Tag color="orange">是</Tag> : <span style={{ color: 'var(--fg-4)' }}>否</span>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, r) => (
        <>
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSyncTarget(r);
              syncForm.resetFields();
            }}
          >
            同步上一学年
          </Button>
        </>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" onClick={() => { setCreateOpen(true); form.resetFields(); }}>
          新增学年配置
        </Button>
      </div>

      <Table<WorkStudyYearSetting>
        rowKey="id"
        columns={columns}
        dataSource={query.data ?? []}
        loading={query.isFetching}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editing ? `编辑学年配置 ${editing.academic_year}` : '新增学年配置'}
        open={createOpen || editing !== null}
        onOk={submit}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        confirmLoading={upsertMut.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ max_fixed_per_student: 1, max_temp_per_student: 5 }}>
          <Form.Item
            label="学年"
            name="academic_year"
            rules={[
              { required: true, message: '请输入学年' },
              { pattern: /^\d{4}-\d{4}$/, message: '形如 2024-2025' },
            ]}
          >
            <Input placeholder="2024-2025" disabled={editing !== null} />
          </Form.Item>
          <Form.Item label="学生固定岗在岗上限" name="max_fixed_per_student">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="学生临时岗在岗上限" name="max_temp_per_student">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="开启岗位申请" name="application_open" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="默认允许单位内部安排"
            name="default_allow_self_arrange"
            valuePropName="checked"
            tooltip="所有用人单位的默认值；可在 employer 上单独覆盖"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={syncTarget ? `同步岗位到 ${syncTarget.academic_year}` : '同步'}
        open={syncTarget !== null}
        onOk={submitSync}
        onCancel={() => { setSyncTarget(null); syncForm.resetFields(); }}
        confirmLoading={syncMut.isPending}
        okText="开始同步"
      >
        <p style={{ marginBottom: 12, color: 'var(--fg-3)' }}>
          会把指定学年的所有岗位（fixed/temporary）复制到 <strong>{syncTarget?.academic_year}</strong>，
          新岗位 status=draft，hired_count 清零。<strong>不会自动续聘</strong>已在岗学生。
        </p>
        <Form form={syncForm} layout="vertical">
          <Form.Item
            label="来源学年"
            name="from_year"
            rules={[
              { required: true, message: '请输入来源学年' },
              { pattern: /^\d{4}-\d{4}$/, message: '形如 2023-2024' },
            ]}
          >
            <Input placeholder="2023-2024" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
