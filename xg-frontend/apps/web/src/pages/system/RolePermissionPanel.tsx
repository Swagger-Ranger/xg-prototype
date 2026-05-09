import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Checkbox,
  Collapse,
  Empty,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  LockOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PermissionItem,
  type RoleSummary,
  getRoleDetail,
  grantRolePerms,
  listRoles,
  revokeRolePerm,
} from '@/api/rolePermission';
import { describeApiError } from '@/utils/api-error';

/**
 * 「角色权限」管理页（系统管理 → 角色权限 tab）。
 *
 * <h3>布局</h3>
 * 左：14 个角色列表（内置 + 自定义分组），点选切换右侧详情
 * 右：选中角色的 35 项权限矩阵，按 module 分组的可折叠卡
 *
 * <h3>权限来源 3 态</h3>
 * - default（DEFAULTS 写死）：☑ 灰底 + 锁图标，disable 不可改 —— 改它要改代码
 * - override（DB sys_role_permission 行）：☑ 蓝底 + 闪电图标，可勾掉
 * - 未授予：☐ 可勾上变 override
 */

const MODULE_LABELS: Record<string, string> = {
  ai: 'AI 助手',
  checkin: '签到',
  collection: '数据收集',
  discipline: '违纪管理',
  knowledge: '知识库',
  leave: '请假管理',
  notification: '通知',
  student: '学生信息',
  system: '系统配置',
  worklog: '工作日志',
  workstudy: '勤工助学',
};

export default function RolePermissionPanel() {
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['admin.roles'],
    queryFn: listRoles,
    staleTime: 30 * 1000,
  });

  const detailQuery = useQuery({
    queryKey: ['admin.role.detail', selectedCode],
    queryFn: () => getRoleDetail(selectedCode!),
    enabled: !!selectedCode,
  });

  // 默认选中第一个角色（首次加载完成后），避免页面进来空空的。
  useEffect(() => {
    if (!selectedCode && rolesQuery.data && rolesQuery.data.length > 0) {
      setSelectedCode(rolesQuery.data[0].code);
    }
  }, [selectedCode, rolesQuery.data]);

  const { builtinRoles, customRoles } = useMemo(() => {
    const all = rolesQuery.data ?? [];
    return {
      builtinRoles: all.filter((r) => r.is_builtin),
      customRoles: all.filter((r) => !r.is_builtin),
    };
  }, [rolesQuery.data]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin.roles'] });
    queryClient.invalidateQueries({ queryKey: ['admin.role.detail', selectedCode] });
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Card
        size="small"
        title="角色"
        style={{ width: 280, flexShrink: 0, borderRadius: 'var(--r-lg)' }}
      >
        {rolesQuery.isLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <RoleGroupHeader
              label="内置角色"
              hint="平台预置，不可删除；权限可加 override"
              count={builtinRoles.length}
            />
            {builtinRoles.map((r) => (
              <RoleRow
                key={r.code}
                role={r}
                selected={selectedCode === r.code}
                onSelect={() => setSelectedCode(r.code)}
              />
            ))}
            <RoleGroupHeader
              label="自定义角色"
              hint="P3 仅展示。新增 / 删除自定义角色留待后续扩展"
              count={customRoles.length}
            />
            {customRoles.length === 0 ? (
              <div style={{ padding: '8px 0', color: 'var(--fg-3)', fontSize: 12 }}>
                暂无自定义角色
              </div>
            ) : (
              customRoles.map((r) => (
                <RoleRow
                  key={r.code}
                  role={r}
                  selected={selectedCode === r.code}
                  onSelect={() => setSelectedCode(r.code)}
                />
              ))
            )}
          </Space>
        )}
      </Card>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedCode ? (
          <Empty description="请从左侧选择一个角色" style={{ marginTop: 80 }} />
        ) : detailQuery.isLoading || !detailQuery.data ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : (
          <RoleDetail
            role={detailQuery.data.role}
            permissions={detailQuery.data.permissions}
            onChange={invalidate}
          />
        )}
      </div>
    </div>
  );
}

function RoleGroupHeader({
  label,
  hint,
  count,
}: {
  label: string;
  hint: string;
  count: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 4px',
        marginTop: 4,
        borderBottom: '1px dashed var(--border-1, #f0f0f0)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--fg-2)', fontWeight: 500 }}>
        {label}
      </span>
      <Badge
        count={count}
        showZero
        color="#d9d9d9"
        style={{ fontSize: 11 }}
      />
      <Tooltip title={hint}>
        <InfoCircleOutlined style={{ color: 'var(--fg-4)', fontSize: 12 }} />
      </Tooltip>
    </div>
  );
}

function RoleRow({
  role,
  selected,
  onSelect,
}: {
  role: RoleSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '8px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        background: selected ? 'rgba(22, 119, 255, 0.08)' : 'transparent',
        border: selected ? '1px solid #1677ff' : '1px solid transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: selected ? 600 : 400, fontSize: 13 }}>{role.name}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {role.effective_perm_count} 项
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--fg-3)',
          marginTop: 2,
          fontFamily: 'monospace',
        }}
      >
        {role.code}
        {role.override_perm_count > 0 && (
          <Tag color="gold" style={{ marginLeft: 6, padding: '0 4px', fontSize: 10 }}>
            +{role.override_perm_count} 自定义
          </Tag>
        )}
      </div>
    </div>
  );
}

function RoleDetail({
  role,
  permissions,
  onChange,
}: {
  role: RoleSummary;
  permissions: PermissionItem[];
  onChange: () => void;
}) {
  // super_admin 是 wildcard：所有权限在后端都返回 source=default、granted=true。UI 提示
  // "通配，不可修改"，禁掉所有勾选交互。
  const isSuperAdmin = role.code === 'super_admin';

  // 按 module 分组
  const byModule = useMemo(() => {
    const m: Record<string, PermissionItem[]> = {};
    for (const p of permissions) {
      const mod = p.module ?? 'other';
      (m[mod] = m[mod] ?? []).push(p);
    }
    return m;
  }, [permissions]);

  const grantMut = useMutation({
    mutationFn: (codes: string[]) => grantRolePerms(role.code, codes),
    onSuccess: (data) => {
      message.success(`已授予 ${data.affected} 项`);
      onChange();
    },
    onError: (e) => message.error(describeApiError(e, '授权失败')),
  });

  const revokeMut = useMutation({
    mutationFn: (permCode: string) => revokeRolePerm(role.code, permCode),
    onSuccess: () => {
      message.success('已撤销');
      onChange();
    },
    onError: (e) => message.error(describeApiError(e, '撤销失败')),
  });

  function handleToggle(p: PermissionItem, checked: boolean) {
    if (isSuperAdmin) return;
    if (p.source === 'default') {
      Modal.info({
        title: '默认权限不可在 UI 修改',
        content:
          '该权限来自 RolePermissionDefaults 代码默认。要拿掉需要修改代码后重新发版，避免运行时误改影响全平台同角色用户。',
      });
      return;
    }
    if (checked) {
      grantMut.mutate([p.code]);
    } else {
      revokeMut.mutate(p.code);
    }
  }

  return (
    <Card
      size="small"
      style={{ borderRadius: 'var(--r-lg)' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{role.name}</span>
            <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{role.code}</Tag>
            {role.is_builtin && (
              <Tag color="default" icon={<LockOutlined />}>
                内置
              </Tag>
            )}
          </Space>
          <Space size="small" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--fg-3)' }}>
              有效权限 <b style={{ color: '#1677ff' }}>{role.effective_perm_count}</b>
              <span style={{ marginLeft: 6 }}>·</span>
              <span style={{ marginLeft: 6 }}>
                自定义 <b style={{ color: '#faad14' }}>{role.override_perm_count}</b>
              </span>
            </span>
          </Space>
        </div>
      }
    >
      {role.description && (
        <Alert
          type="info"
          showIcon
          message={role.description}
          style={{ marginBottom: 12 }}
        />
      )}
      {isSuperAdmin && (
        <Alert
          type="warning"
          showIcon
          message="超级管理员通过 wildcard 拥有全部权限，本页不允许修改。如需调整请改 RolePermissionDefaults 代码。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Collapse
        defaultActiveKey={Object.keys(byModule)}
        size="small"
        items={Object.entries(byModule).map(([mod, perms]) => {
          const grantedCount = perms.filter((p) => p.granted).length;
          return {
            key: mod,
            label: (
              <Space>
                <span style={{ fontWeight: 500 }}>
                  {MODULE_LABELS[mod] ?? mod}
                </span>
                <Tag style={{ margin: 0, padding: '0 6px', fontSize: 11 }}>
                  {grantedCount} / {perms.length}
                </Tag>
              </Space>
            ),
            children: (
              <List
                size="small"
                dataSource={perms}
                renderItem={(p) => (
                  <PermRow
                    perm={p}
                    isSuperAdmin={isSuperAdmin}
                    onToggle={(checked) => handleToggle(p, checked)}
                    busy={grantMut.isPending || revokeMut.isPending}
                  />
                )}
              />
            ),
          };
        })}
      />
    </Card>
  );
}

function PermRow({
  perm,
  isSuperAdmin,
  onToggle,
  busy,
}: {
  perm: PermissionItem;
  isSuperAdmin: boolean;
  onToggle: (checked: boolean) => void;
  busy: boolean;
}) {
  const isDefault = perm.source === 'default';
  const isOverride = perm.source === 'override';
  const isUngranted = !perm.granted;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 0',
        gap: 10,
      }}
    >
      <Checkbox
        checked={perm.granted}
        disabled={busy || isSuperAdmin || isDefault}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span style={{ flex: 1, fontSize: 13 }}>
        <span style={{ fontFamily: 'monospace', color: 'var(--fg-2)', marginRight: 8 }}>
          {perm.code}
        </span>
        <span>{perm.name}</span>
      </span>
      {isDefault && (
        <Tag
          color="default"
          icon={<LockOutlined />}
          style={{ margin: 0, fontSize: 11 }}
        >
          默认
        </Tag>
      )}
      {isOverride && (
        <Tag
          color="gold"
          icon={<ThunderboltOutlined />}
          style={{ margin: 0, fontSize: 11 }}
        >
          自定义
        </Tag>
      )}
      {isUngranted && (
        <Tag color="default" style={{ margin: 0, fontSize: 11, opacity: 0.5 }}>
          未授予
        </Tag>
      )}
    </div>
  );
}
