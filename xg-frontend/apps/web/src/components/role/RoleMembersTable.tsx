// 通用「某角色 / 团队的成员管理」表 —— 给两处复用:
//   1) 系统管理 → 角色权限 → 角色详情 → 成员 tab
//   2) 勤工助学 → 业务配置 → 人员任命 → 资助中心成员 Card
//
// 行为:
//   - 列出该 roleCode 下所有用户(姓名 / 工号 / 电话 / 邮箱)
//   - [+ 添加] 弹 UserPicker 多选,后端没有原子加角色 API,所以走"先查 user 现有
//     role_codes,push 新 code,PUT updateUser"流程。并发漏洞接受(P0)。
//   - [移除] 同样 filter 掉再 PUT,带二次确认
//
// 文案铁律:绝不在 UI 暴露 role code(`aid_center_officer` / `team_xxx` 等英文)。
// 所有标签 / 提示用 roleName(中文)。

import { useMemo, useState } from 'react';
import { Button, Empty, Modal, Space, Spin, Table } from 'antd';
import { UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from '@/utils/antdApp';
import UserPicker from '@/components/picker/UserPicker';
import { getUsers, updateUser, type SystemUser } from '@/api/system';
import { describeApiError } from '@/utils/api-error';

export interface RoleMembersTableProps {
  /** 角色 code,后端字段。仅用于查询/写入,UI 上不显示。 */
  roleCode: string;
  /** 中文显示名,用在按钮、提示、确认 Modal 里 */
  roleName: string;
}

export default function RoleMembersTable({ roleCode, roleName }: RoleMembersTableProps) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // 服务端分页:原写法只拉前 100 直接 hardcode size=100,团队 > 100 人会有"隐形成员",
  // 现在按 page / size 翻页,table 上展示总数。
  const membersQ = useQuery<{ data: SystemUser[]; total: number }>({
    queryKey: ['role-members', roleCode, page, PAGE_SIZE],
    queryFn: async () => {
      const r = await getUsers({ page, size: PAGE_SIZE, roleCode });
      return { data: r.data, total: r.total };
    },
  });

  const removeMut = useMutation({
    mutationFn: async (user: SystemUser) => {
      const next = (user.role_codes || []).filter((r) => r !== roleCode);
      await updateUser(user.id, { role_codes: next });
    },
    onSuccess: () => {
      message.success(`已移出${roleName}`);
      qc.invalidateQueries({ queryKey: ['role-members', roleCode] });
    },
    onError: (e) => message.error(describeApiError(e, '移除失败')),
  });

  const handleRemove = (u: SystemUser) => {
    Modal.confirm({
      title: `确定把 ${u.real_name || u.username} 移出${roleName}?`,
      content: '移除后该用户将失去本团队对应的所有能力(包括正在进行的任务派发)。',
      okText: '确认移除',
      okButtonProps: { danger: true },
      cancelText: '再想想',
      onOk: () => removeMut.mutateAsync(u),
    });
  };

  const members = membersQ.data?.data ?? [];
  const total = membersQ.data?.total ?? 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>{total} 位成员</span>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
          添加成员
        </Button>
      </div>

      {membersQ.isLoading ? (
        <Spin />
      ) : total === 0 ? (
        <Empty description={`(暂无${roleName}成员)`} />
      ) : (
        <Table<SystemUser>
          size="small"
          rowKey="id"
          dataSource={members}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
          columns={[
            {
              title: '姓名',
              dataIndex: 'real_name',
              render: (v: string, r) => v || r.username,
            },
            { title: '工号', dataIndex: 'username', width: 130 },
            {
              title: '电话',
              dataIndex: 'phone',
              width: 140,
              render: (v: string | null) =>
                v || <span style={{ color: 'var(--fg-3)' }}>—</span>,
            },
            {
              title: '邮箱',
              dataIndex: 'email',
              render: (v: string | null) =>
                v || <span style={{ color: 'var(--fg-3)' }}>—</span>,
            },
            {
              title: '',
              key: 'op',
              width: 80,
              render: (_, r) => (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(r)}
                  loading={removeMut.isPending && removeMut.variables?.id === r.id}
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
      )}

      <AddMembersModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roleCode={roleCode}
        roleName={roleName}
        existingIds={new Set(members.map((m) => m.id))}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['role-members', roleCode] })}
      />
    </>
  );
}

function AddMembersModal({
  open,
  onClose,
  roleCode,
  roleName,
  existingIds,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  roleCode: string;
  roleName: string;
  existingIds: Set<string>;
  onSuccess: () => void;
}) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  // 预拉教职工池(500 上限),用 id 反查现有 role_codes,加角色时不丢已有角色。
  // P0 限制:超过 500 的教职工号当前会落空 — submitMut 里 fallback 是"新增 roleCode 这一项",
  // 没法保留原 role_codes(会被裹挟)。极端校规模才会触发,留 TODO 等 UserPicker 暴露
  // 多选 SystemUser 完整对象的回调,届时直接用 picker 数据替换 pool 查询。
  const poolQ = useQuery<SystemUser[]>({
    queryKey: ['role-add-staff-pool'],
    queryFn: async () => {
      const r = await getUsers({ page: 1, size: 500 });
      return r.data;
    },
    enabled: open,
    staleTime: 30_000,
  });
  const poolById = useMemo(() => {
    const m = new Map<string, SystemUser>();
    for (const u of poolQ.data ?? []) m.set(u.id, u);
    return m;
  }, [poolQ.data]);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (pickedIds.length === 0) throw new Error('请选择至少一位用户');
      const errors: string[] = [];
      let added = 0;
      for (const id of pickedIds) {
        if (existingIds.has(id)) continue;
        const user = poolById.get(id);
        const existing = user?.role_codes ?? [];
        if (existing.includes(roleCode)) continue;
        const next = [...existing, roleCode];
        try {
          await updateUser(id, { role_codes: next });
          added += 1;
        } catch (e) {
          errors.push(`${user?.real_name || id}: ${describeApiError(e, '失败')}`);
        }
      }
      if (errors.length > 0) throw new Error(errors.join('; '));
      return added;
    },
    onSuccess: (added) => {
      message.success(added > 0 ? `已加入 ${added} 位成员` : '所选成员均已在组');
      setPickedIds([]);
      onClose();
      onSuccess();
    },
    onError: (e) => message.error(describeApiError(e, '部分添加失败')),
  });

  return (
    <Modal
      title={`添加${roleName}成员`}
      open={open}
      onCancel={() => {
        setPickedIds([]);
        onClose();
      }}
      onOk={() => submitMut.mutate()}
      okText="加入"
      confirmLoading={submitMut.isPending || poolQ.isLoading}
      okButtonProps={{ disabled: pickedIds.length === 0 }}
      width={520}
    >
      <p style={{ color: 'var(--fg-3)', fontSize: 13, marginBottom: 12 }}>
        可一次选多人,已是成员的会自动跳过。
      </p>
      <UserPicker
        multiple
        value={pickedIds}
        onChange={(v) => setPickedIds(Array.isArray(v) ? v : v ? [v] : [])}
        placeholder="搜索姓名或工号"
        style={{ width: '100%' }}
      />
    </Modal>
  );
}
