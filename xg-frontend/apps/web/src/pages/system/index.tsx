import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Tag, Select, Button, Input, Modal, Form, Tabs, Switch } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleCode } from '@xg1/shared';
import { ROLE_LABELS as SHARED_ROLE_LABELS } from '@xg1/shared';
import type { SystemUser, UserQueryParams, CreateUserData, UpdateUserData } from '@/api/system';
import { getUsers, createUser, updateUser, resetPassword, toggleUserStatus } from '@/api/system';
import styles from './index.module.css';
import { describeApiError } from '@/utils/api-error';
import AiMetricsPanel from './AiMetricsPanel';
import KnowledgePanel from './KnowledgePanel';
import RolePermissionPanel from './RolePermissionPanel';
import SettingsPanel from './settings/SettingsPanel';
import NotificationCenterPanel from './notification/NotificationCenterPanel';

// 单一数据源：从 @xg1/shared 拉 RoleCode + ROLE_LABELS。super_admin 不在
// 普通管理员可见的列表里（系统级运维，走 platform-admin 后台维护）。
const ASSIGNABLE_ROLES: RoleCode[] = [
  'student',
  'counselor',
  'class_master',
  'college_admin',
  'college_secretary',
  'dean',
  'student_affairs_officer',
  'student_affairs_director',
  'school_admin',
  'employer',
];

const ROLE_LABELS: Record<string, string> = SHARED_ROLE_LABELS;

const STATUS_LABELS: Record<string, string> = { active: '正常', disabled: '禁用' };
const STATUS_COLORS: Record<string, string> = { active: 'var(--ok)', disabled: 'var(--danger)' };

const ROLE_OPTIONS = [
  { label: '全部角色', value: '' },
  ...ASSIGNABLE_ROLES.map((r) => ({ label: SHARED_ROLE_LABELS[r], value: r })),
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '正常', value: 'active' },
  { label: '禁用', value: 'disabled' },
];

const ROLE_SELECT_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({
  label: SHARED_ROLE_LABELS[r],
  value: r,
}));

const PAGE_SIZE = 20;

export default function SystemManagement() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // 默认 false：列表呈现教职工 + 外部账号；学生量级（数千～数万）和教职工不一样,
  // 默认混着列会把表格淹没。需要查特定学生（忘密码、毕业归档）时把 toggle 打开。
  const [includeStudents, setIncludeStudents] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<SystemUser | null>(null);

  const [createForm] = Form.useForm<CreateUserData>();
  const [editForm] = Form.useForm<UpdateUserData>();

  const queryClient = useQueryClient();

  const queryParams: UserQueryParams = {
    page,
    size: PAGE_SIZE,
    keyword: keyword || undefined,
    status: filterStatus || undefined,
    roleCode: filterRole || undefined,
    includeStudents: includeStudents || undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['systemUsers', queryParams],
    queryFn: () => getUsers(queryParams),
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success('用户创建成功');
      queryClient.invalidateQueries({ queryKey: ['systemUsers'] });
      createForm.resetFields();
      setCreateOpen(false);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '创建失败，请重试')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserData }) => updateUser(id, data),
    onSuccess: () => {
      message.success('更新成功');
      queryClient.invalidateQueries({ queryKey: ['systemUsers'] });
      editForm.resetFields();
      setEditUser(null);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败，请重试')),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      message.success('密码已重置');
    },
    onError: (e: unknown) => message.error(describeApiError(e, '重置密码失败，请重试')),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      toggleUserStatus(id, status),
    onSuccess: () => {
      message.success('操作成功');
      queryClient.invalidateQueries({ queryKey: ['systemUsers'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '操作失败，请重试')),
  });

  const handleCreateSubmit = async () => {
    const values = await createForm.validateFields();
    createMutation.mutate(values);
  };

  const handleEditSubmit = async () => {
    if (!editUser) return;
    const values = await editForm.validateFields();
    updateMutation.mutate({ id: editUser.id, data: values });
  };

  const handleResetPassword = (record: SystemUser) => {
    Modal.confirm({
      title: '确认重置密码',
      content: `确定要重置用户「${record.real_name}」的密码吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => resetPasswordMutation.mutate(record.id),
    });
  };

  const handleToggleStatus = (record: SystemUser) => {
    const toStatus = record.status === 'active' ? 'disabled' : 'active';
    const action = toStatus === 'disabled' ? '禁用' : '启用';
    Modal.confirm({
      title: `确认${action}用户`,
      content: `确定要${action}用户「${record.real_name}」吗？`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: toStatus === 'disabled' ? { danger: true } : {},
      onOk: () => toggleStatusMutation.mutate({ id: record.id, status: toStatus }),
    });
  };

  const handleOpenEdit = (record: SystemUser) => {
    setEditUser(record);
    editForm.setFieldsValue({
      real_name: record.real_name,
      phone: record.phone,
      email: record.email,
      role_codes: record.role_codes,
    });
  };

  const columns: ColumnsType<SystemUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'real_name',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'role_codes',
      width: 180,
      render: (codes: string[]) => (
        <div className={styles.roleTags}>
          {codes.map((code) => (
            <Tag key={code}>{ROLE_LABELS[code] ?? code}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '手机',
      dataIndex: 'phone',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => (
        <span
          className={styles.statusTag}
          style={{
            backgroundColor: `${STATUS_COLORS[status]}18`,
            color: STATUS_COLORS[status],
            border: `1px solid ${STATUS_COLORS[status]}40`,
          }}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      width: 160,
      render: (v: string | null) => {
        if (!v) return '-';
        return new Date(v).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <span>
          <button className={styles.actionLink} onClick={() => handleOpenEdit(record)}>
            编辑
          </button>
          <button className={styles.actionLink} onClick={() => handleResetPassword(record)}>
            重置密码
          </button>
          <button
            className={`${styles.actionLink} ${record.status === 'active' ? styles.danger : ''}`}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '禁用' : '启用'}
          </button>
        </span>
      ),
    },
  ];

  const userManagement = (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title} style={{ marginTop: 0, marginBottom: 4 }}>用户管理</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>
            {includeStudents ? '当前包含学生账号' : '仅教职工与外部账号（学生在「学生信息」管理）'}
          </div>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          添加用户
        </Button>
      </div>

      <div className={styles.filterBar}>
        <Input.Search
          placeholder={includeStudents ? '按用户名 / 姓名 / 学号搜索' : '搜索用户名或姓名'}
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => { setKeyword(v); setPage(1); }}
          onChange={(e) => { if (!e.target.value) { setKeyword(''); setPage(1); } }}
        />
        <Select
          style={{ width: 130 }}
          value={filterRole}
          onChange={(v) => { setFilterRole(v); setPage(1); }}
          options={ROLE_OPTIONS}
        />
        <Select
          style={{ width: 120 }}
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)' }}>
          包含学生
          <Switch
            size="small"
            checked={includeStudents}
            onChange={(v) => { setIncludeStudents(v); setPage(1); }}
          />
        </span>
      </div>

      <div className={styles.tableCard}>
        <Table<SystemUser>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      {/* Create user modal */}
      <Modal
        title="添加用户"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        footer={[
          <Button key="cancel" onClick={() => { setCreateOpen(false); createForm.resetFields(); }}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={createMutation.isPending}
            onClick={handleCreateSubmit}
          >
            创建
          </Button>,
        ]}
        width={520}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="real_name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="请输入手机号" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item
            name="role_codes"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择角色"
              options={ROLE_SELECT_OPTIONS}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, message: '请输入初始密码' }]}
          >
            <Input.Password placeholder="请输入初始密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        title="编辑用户"
        open={editUser !== null}
        onCancel={() => { setEditUser(null); editForm.resetFields(); }}
        footer={[
          <Button key="cancel" onClick={() => { setEditUser(null); editForm.resetFields(); }}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={updateMutation.isPending}
            onClick={handleEditSubmit}
          >
            保存
          </Button>,
        ]}
        width={520}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="real_name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="请输入手机号" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item
            name="role_codes"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择角色"
              options={ROLE_SELECT_OPTIONS}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  return (
    <div className={styles.page}>
      <SystemTabs userManagement={userManagement} />
    </div>
  );
}

/**
 * Tabs 控制器：把 active tab 跟 URL `?tab=` 同步。
 * 「组织派班」已挪进「基础设置」的子 tab；如有老的 ?tab=org 深链需要新走
 * ?tab=settings&sub=org 之类的方案，目前没人用，先不做。
 */
function SystemTabs({ userManagement }: { userManagement: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'users';
  return (
    <Tabs
      activeKey={tab}
      size="middle"
      onChange={(k) => {
        const next = new URLSearchParams(searchParams);
        if (k === 'users') next.delete('tab');
        else next.set('tab', k);
        setSearchParams(next, { replace: true });
      }}
      items={[
        { key: 'users', label: '用户管理', children: userManagement },
        { key: 'roles', label: '角色权限', children: <RolePermissionPanel /> },
        { key: 'settings', label: '基础设置', children: <SettingsPanel /> },
        { key: 'notif', label: '通知管理', children: <NotificationCenterPanel /> },
        { key: 'ai', label: 'AI 表现', children: <AiMetricsPanel /> },
        { key: 'kb', label: '知识库', children: <KnowledgePanel /> },
      ]}
    />
  );
}
