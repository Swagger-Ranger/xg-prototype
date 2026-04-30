import { useState } from 'react';
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  createEmployer,
  type Employer,
  type EmployerUpsert,
  listEmployers,
  setEmployerStatus,
  updateEmployer,
} from '@/api/workStudy';
import UserPicker from '@/components/picker/UserPicker';

const { TextArea } = Input;
const PAGE_SIZE = 20;
/** Roles that can plausibly head a 用工单位 — keep narrow so the picker
 *  isn't drowned in students. Operators have no role filter. */
const LEADER_ROLE_CODES = [
  'employer',
  'school_admin',
  'student_affairs_officer',
  'dean',
  'college_admin',
];

export default function EmployersTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Employer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<EmployerUpsert>();

  const query = useQuery({
    queryKey: ['employers', page, keyword],
    queryFn: () => listEmployers({ page, size: PAGE_SIZE, keyword: keyword || undefined }),
  });

  const createMut = useMutation({
    mutationFn: createEmployer,
    onSuccess: () => {
      message.success('用人单位已创建');
      setCreateOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['employers'] });
    },
    onError: (e) => message.error(describeApiError(e, '创建失败')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployerUpsert }) => updateEmployer(id, data),
    onSuccess: () => {
      message.success('用人单位已更新');
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['employers'] });
    },
    onError: (e) => message.error(describeApiError(e, '更新失败')),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      setEmployerStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employers'] }),
    onError: (e) => message.error(describeApiError(e, '状态切换失败')),
  });

  const openEdit = (e: Employer) => {
    setEditing(e);
    form.setFieldsValue({
      name: e.name,
      leader_user_id: e.leader_user_id,
      operator_user_ids: Array.isArray(e.operator_user_ids)
        ? e.operator_user_ids
        : typeof e.operator_user_ids === 'string'
        ? safeJsonArray(e.operator_user_ids)
        : [],
      contact_name: e.contact_name ?? undefined,
      contact_phone: e.contact_phone ?? undefined,
      email: e.email ?? undefined,
      allow_self_arrange: e.allow_self_arrange,
      remark: e.remark ?? undefined,
    });
  };

  const submit = () => {
    form.validateFields().then((v) => {
      const opIds = v.operator_user_ids as unknown as string[] | undefined;
      const payload: EmployerUpsert = {
        ...v,
        leader_user_id: String(v.leader_user_id),
        operator_user_ids: opIds && opIds.length ? opIds.map(String) : undefined,
      };
      if (editing) updateMut.mutate({ id: editing.id, data: payload });
      else createMut.mutate(payload);
    });
  };

  const columns: ColumnsType<Employer> = [
    { title: '单位名称', dataIndex: 'name', ellipsis: true },
    { title: '负责人 ID', dataIndex: 'leader_user_id', width: 100 },
    { title: '联系人', dataIndex: 'contact_name', width: 110, render: (v) => v ?? '—' },
    { title: '电话', dataIndex: 'contact_phone', width: 130, render: (v) => v ?? '—' },
    { title: '邮箱', dataIndex: 'email', width: 180, ellipsis: true, render: (v) => v ?? '—' },
    {
      title: '内部安排',
      dataIndex: 'allow_self_arrange',
      width: 90,
      render: (v: boolean) => (v ? <Tag color="orange">允许</Tag> : <span style={{ color: 'var(--fg-4)' }}>—</span>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string, r) => (
        <Switch
          checked={v === 'active'}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          onChange={(checked) =>
            statusMut.mutate({ id: r.id, status: checked ? 'active' : 'disabled' })
          }
          loading={statusMut.isPending}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => openEdit(r)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input.Search
          placeholder="按单位名称搜索"
          allowClear
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          style={{ maxWidth: 280 }}
        />
        <div style={{ flex: 1 }} />
        <Button type="primary" onClick={() => { setCreateOpen(true); form.resetFields(); }}>
          新增用人单位
        </Button>
      </div>

      <Table<Employer>
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
        title={editing ? '编辑用人单位' : '新增用人单位'}
        open={createOpen || editing !== null}
        onOk={submit}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="单位名称"
            name="name"
            rules={[{ required: true, message: '请输入单位名称' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            label="负责人"
            name="leader_user_id"
            rules={[{ required: true, message: '请选择负责人' }]}
            tooltip='搜姓名/账号选择。该用户作为本单位的"用人单位领导"参与岗位审批'
          >
            <UserPicker roleCodes={LEADER_ROLE_CODES} placeholder="搜姓名 / 账号 选负责人" />
          </Form.Item>
          <Form.Item
            label="操作员"
            name="operator_user_ids"
            tooltip="可选。这些用户能代表本单位日常操作（不参与审批）"
          >
            <UserPicker multiple placeholder="可选，搜姓名 / 账号 选若干人" />
          </Form.Item>
          <Form.Item label="联系人" name="contact_name">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item label="联系电话" name="contact_phone">
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="allow_self_arrange" valuePropName="checked">
            <Checkbox>允许本单位内部直接安排学生（覆盖学年默认值）</Checkbox>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function safeJsonArray(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
