import { useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  createEmployer,
  type Employer,
  type EmployerUpsert,
  listEmployers,
  listPositions,
  setEmployerStatus,
  updateEmployer,
  type WorkStudyPosition,
} from '@/api/workStudy';
import UserPicker, { type PickedUser } from '@/components/picker/UserPicker';
import StaffAssignmentSection from './StaffAssignmentSection';

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
  const [viewingEmployer, setViewingEmployer] = useState<Employer | null>(null);
  const [form] = Form.useForm<EmployerUpsert>();
  // 负责人信息(表单下方只读卡 + 提交时回填 contact_* 列)。来源:
  //   - 新增 / 选人时:UserPicker.onUserSelect 给出完整 PickedUser
  //   - 编辑打开时:从 Employer.contact_* 字段构造(无 username / role_codes,因为
  //     这两个不在 Employer 表里;那一列 UI 上 fallback 即可)
  // 之前还依赖一个对 /system/users 全量拉教职工池的 staffPoolQ 来反查 username/role_codes,
  // 那个接口要 system:user:manage 权限,学工处 / employer 都没有 → 403 + 列表负责人列为空。
  // 现在彻底走 denormalized 字段,代价:列表里负责人不再附带工号 / 角色 Tag(被认为可接受)。
  const [leaderInfo, setLeaderInfo] = useState<PickedUser | null>(null);

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
    // contact_* 是单位保存时从负责人档案 denormalized 过来的快照;username / role_codes
    // 不在快照里,留空,UI 上不展示工号 / 角色 Tag。如果用户重新点 UserPicker 选人,
    // onUserSelect 会用最新完整记录覆盖。
    setLeaderInfo(
      e.contact_name
        ? {
            id: e.leader_user_id,
            username: '',
            real_name: e.contact_name,
            phone: e.contact_phone ?? '',
            email: e.email ?? '',
            role_codes: [],
          }
        : null,
    );
    form.setFieldsValue({
      name: e.name,
      leader_user_id: e.leader_user_id,
      operator_user_ids: Array.isArray(e.operator_user_ids)
        ? e.operator_user_ids
        : typeof e.operator_user_ids === 'string'
        ? safeJsonArray(e.operator_user_ids)
        : [],
      allow_self_arrange: e.allow_self_arrange,
      monthly_salary_cap: e.monthly_salary_cap ? Number(e.monthly_salary_cap) : undefined,
      remark: e.remark ?? undefined,
    });
  };

  const openCreate = () => {
    setCreateOpen(true);
    setLeaderInfo(null);
    form.resetFields();
  };

  // contact_name/phone/email 不再以单独字段暴露给老师 — 数据来源单一(负责人档案),
  // 提交时自动从 leaderInfo 回填,避免"用户改了电话但单位联系电话仍是旧值"的漂移。
  const submit = () => {
    form.validateFields().then((v) => {
      const opIds = v.operator_user_ids as unknown as string[] | undefined;
      const payload: EmployerUpsert = {
        ...v,
        leader_user_id: String(v.leader_user_id),
        operator_user_ids: opIds && opIds.length ? opIds.map(String) : undefined,
        contact_name: leaderInfo?.real_name ?? undefined,
        contact_phone: leaderInfo?.phone ?? undefined,
        email: leaderInfo?.email ?? undefined,
      };
      if (editing) updateMut.mutate({ id: editing.id, data: payload });
      else createMut.mutate(payload);
    });
  };

  const columns: ColumnsType<Employer> = [
    { title: '单位名称', dataIndex: 'name', ellipsis: true },
    // 三列都直接读 employer 的 contact_* denormalized 快照,提交时已自动
    // 跟随 leaderInfo 回填(submit() 中的 contact_name / contact_phone / email)。
    // 不依赖跨表查 sys_user → 不再受 system:user:manage 权限 gate 限制。
    {
      title: '负责人',
      key: 'leader',
      width: 140,
      render: (_, r) =>
        r.contact_name ?? <span style={{ color: 'var(--fg-3)' }}>—</span>,
    },
    {
      title: '电话',
      key: 'phone',
      width: 130,
      render: (_, r) =>
        r.contact_phone || <span style={{ color: 'var(--fg-3)' }}>—</span>,
    },
    {
      title: '邮箱',
      key: 'email',
      width: 180,
      ellipsis: true,
      render: (_, r) =>
        r.email || <span style={{ color: 'var(--fg-3)' }}>—</span>,
    },
    {
      title: '允许直接录用',
      dataIndex: 'allow_self_arrange',
      width: 110,
      render: (v: boolean) =>
        v ? <Tag color="blue">允许</Tag> : <span style={{ color: 'var(--fg-3)' }}>—</span>,
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
      width: 140,
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Tooltip title="查看本单位岗位">
            <Button
              type="link"
              size="small"
              icon={<RightOutlined />}
              onClick={() => setViewingEmployer(r)}
            />
          </Tooltip>
        </Space>
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
        <Button type="primary" onClick={openCreate}>
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

      <div style={{ marginTop: 24 }}>
        <StaffAssignmentSection />
      </div>

      {viewingEmployer && (
        <EmployerPositionsDrawer
          employer={viewingEmployer}
          onClose={() => setViewingEmployer(null)}
        />
      )}

      <Modal
        title={editing ? '编辑用人单位' : '新增用人单位'}
        open={createOpen || editing !== null}
        onOk={submit}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          setLeaderInfo(null);
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
            <Input maxLength={200} placeholder="如:校园咖啡店、图书馆勤工岗" />
          </Form.Item>

          <Form.Item
            label="负责人"
            name="leader_user_id"
            rules={[{ required: true, message: '请选择负责人' }]}
            help="本单位的联系信息(姓名/电话/邮箱)自动跟随负责人档案,无需单独维护"
          >
            <UserPicker
              roleCodes={LEADER_ROLE_CODES}
              placeholder="搜姓名 / 账号 选负责人"
              onUserSelect={(u) => setLeaderInfo(u)}
              // 编辑模式下没有 staffPoolQ,UserPicker 自己的搜索也要等用户输入关键词才会拉,
              // 所以预 seed 一条用 contact_* 拼出来的记录,让初始 value 能渲染成名字
              // 而不是裸 user_id。username 留空,UserPicker 的 userLabel 会跳过 (工号) 部分。
              seedUsers={
                leaderInfo && leaderInfo.id ? [leaderInfo] : []
              }
            />
          </Form.Item>

          {/* 负责人信息只读卡 — 数据来源:UserPicker.onUserSelect(最新)或编辑打开时从 contact_* 构造。 */}
          {leaderInfo && (
            <div
              style={{
                background: 'var(--bg-3)',
                borderRadius: 'var(--r)',
                padding: '8px 12px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--fg-2)',
              }}
            >
              <div>
                <strong>{leaderInfo.real_name || leaderInfo.username || '负责人'}</strong>
                {leaderInfo.username && (
                  <span style={{ color: 'var(--fg-3)', marginLeft: 6 }}>
                    ({leaderInfo.username})
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--fg-3)', marginTop: 2 }}>
                {leaderInfo.phone || '电话未填'}
                <span style={{ margin: '0 8px' }}>·</span>
                {leaderInfo.email || '邮箱未填'}
              </div>
            </div>
          )}

          {/* 协助人员 — 只在编辑模式显示。新增时默认为空,后续到「业务配置 → 人员任命」
              或回本表单"编辑"模式增减。第一次建单位的人少看 1 个字段。 */}
          {editing && (
            <Form.Item
              label="协助人员"
              name="operator_user_ids"
              help="本单位负责人之外、可帮忙发布岗位 / 修改单位信息的老师。不参与审批,纯协助。"
            >
              <UserPicker multiple placeholder="可选,搜姓名 / 账号 选若干人" />
            </Form.Item>
          )}

          <Form.Item
            label="允许直接录用"
            name="allow_self_arrange"
            valuePropName="checked"
            help="开启:本单位可不经学生申请,直接把学生加岗位上岗(覆盖学年默认)。关闭(默认):所有学生必须主动申请。"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>

          <Form.Item
            label="月薪酬上限"
            name="monthly_salary_cap"
            help="本单位每月勤工薪酬累计申报上限。留空 = 不限,按月累计校验。"
          >
            <InputNumber
              min={0}
              step={100}
              precision={2}
              style={{ width: '100%' }}
              placeholder="留空 = 不限"
              addonAfter="元"
            />
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <TextArea rows={3} maxLength={2000} placeholder="内部备注,学生侧不可见(选填)" />
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

/** 行操作「查岗位」对应的 Drawer:列出该 employer 名下的所有岗位概要。 */
function EmployerPositionsDrawer({
  employer,
  onClose,
}: {
  employer: Employer;
  onClose: () => void;
}) {
  const positionsQ = useQuery({
    queryKey: ['workstudy-positions-by-employer', employer.id],
    queryFn: () => listPositions({ page: 1, size: 100, employer_id: employer.id }),
  });
  const positions = positionsQ.data?.data ?? [];

  return (
    <Drawer
      title={`${employer.name} · 本单位岗位`}
      open
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      {positionsQ.isLoading ? (
        <Spin />
      ) : positions.length === 0 ? (
        <Empty description="(本单位尚无岗位)" />
      ) : (
        <Table<WorkStudyPosition>
          size="small"
          rowKey="id"
          dataSource={positions}
          pagination={false}
          columns={[
            { title: '岗位', dataIndex: 'title' },
            {
              title: '类型',
              dataIndex: 'position_type',
              width: 80,
              render: (v: string) =>
                v === 'fixed' ? <Tag color="geekblue">固定</Tag> : <Tag>临时</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: '在岗 / 招',
              key: 'count',
              width: 90,
              render: (_, r) => `${r.hired_count ?? 0} / ${r.headcount ?? 0}`,
            },
          ]}
        />
      )}
    </Drawer>
  );
}
