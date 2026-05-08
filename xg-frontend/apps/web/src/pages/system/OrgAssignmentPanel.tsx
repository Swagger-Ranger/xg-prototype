import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tree,
  message,
} from 'antd';
import { StarFilled, StarOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AssignableUser,
  type CounselorMapping,
  type OrgTreeNode,
  createCounselorMapping,
  deleteCounselorMapping,
  fetchOrgTree,
  listClassMasters,
  listCounselors,
  updateLeader,
  updateMappingPrimary,
} from '@/api/orgAssignment';

/**
 * 「组织派班」tab。左侧组织树（college / class），选中节点后右侧根据类型展示
 * 不同的指派面板：
 *   - class：班主任（单选，写 org_unit.leader_id）+ 辅导员列表
 *   - college：辅导员列表（挂学院级，自动覆盖下级所有班）
 *
 * 写操作都通过单独的 endpoint 走（PUT/POST/DELETE），完成后 invalidate
 * 'org.tree' 让 UI 立即同步。
 */
export default function OrgAssignmentPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tree = [], isFetching: treeLoading } = useQuery({
    queryKey: ['org.tree'],
    queryFn: fetchOrgTree,
    staleTime: 30 * 1000,
  });
  const { data: classMasters = [] } = useQuery({
    queryKey: ['org.classMasters'],
    queryFn: listClassMasters,
    staleTime: 60 * 1000,
  });
  const { data: counselors = [] } = useQuery({
    queryKey: ['org.counselors'],
    queryFn: listCounselors,
    staleTime: 60 * 1000,
  });

  const treeData = useMemo(() => buildAntdTree(tree), [tree]);
  const selected = useMemo(
    () => tree.find((n) => n.id === selectedId) ?? null,
    [tree, selectedId],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['org.tree'] });
    // 派班结果可能消除"审批链卡死"健康警告
    queryClient.invalidateQueries({ queryKey: ['leaveConfig.health'] });
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Card
        size="small"
        title="组织树"
        style={{ width: 320, flexShrink: 0, borderRadius: 'var(--r-lg)' }}
      >
        {treeLoading ? (
          <Empty description="加载中…" />
        ) : tree.length === 0 ? (
          <Empty description="尚未配置任何 college / class" />
        ) : (
          <Tree
            treeData={treeData}
            defaultExpandAll
            blockNode
            selectedKeys={selectedId != null ? [selectedId] : []}
            onSelect={(keys) => setSelectedId(keys.length ? String(keys[0]) : null)}
          />
        )}
      </Card>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <Empty description="从左侧组织树选一个学院或班级开始派班" style={{ marginTop: 80 }} />
        ) : selected.type === 'class' ? (
          <ClassPanel
            node={selected}
            classMasters={classMasters}
            counselors={counselors}
            onChange={invalidate}
          />
        ) : (
          <CollegePanel
            node={selected}
            counselors={counselors}
            onChange={invalidate}
          />
        )}
      </div>
    </div>
  );
}

function ClassPanel({
  node,
  classMasters,
  counselors,
  onChange,
}: {
  node: OrgTreeNode;
  classMasters: AssignableUser[];
  counselors: AssignableUser[];
  onChange: () => void;
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card
        size="small"
        title={`🏫 ${node.name}（班级）`}
        style={{ borderRadius: 'var(--r-lg)' }}
      >
        <LeaderSection node={node} classMasters={classMasters} onChange={onChange} />
      </Card>
      <CounselorListCard
        node={node}
        counselors={counselors}
        onChange={onChange}
        helperText="挂在班级上的辅导员只覆盖本班；如果想覆盖整个学院的所有班，建议挂到学院节点。"
      />
    </Space>
  );
}

function CollegePanel({
  node,
  counselors,
  onChange,
}: {
  node: OrgTreeNode;
  counselors: AssignableUser[];
  onChange: () => void;
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card
        size="small"
        title={`🎓 ${node.name}（学院）`}
        style={{ borderRadius: 'var(--r-lg)' }}
      >
        <Alert
          type="info"
          showIcon
          message="学院节点只能指派辅导员，会自动覆盖该学院下的所有班级。班主任请到具体班级节点指派。"
        />
      </Card>
      <CounselorListCard
        node={node}
        counselors={counselors}
        onChange={onChange}
        helperText="挂在学院上的辅导员对该学院下所有班级生效。"
      />
    </Space>
  );
}

function LeaderSection({
  node,
  classMasters,
  onChange,
}: {
  node: OrgTreeNode;
  classMasters: AssignableUser[];
  onChange: () => void;
}) {
  const setMut = useMutation({
    mutationFn: (leaderId: string | null) => updateLeader(node.id, leaderId),
    onSuccess: (_, leaderId) => {
      message.success(leaderId == null ? '已清空班主任' : '已指派班主任');
      onChange();
    },
    onError: (e: unknown) =>
      message.error(`操作失败：${e instanceof Error ? e.message : String(e)}`),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 64, color: 'var(--fg-3)' }}>班主任</span>
      <Select
        style={{ flex: 1 }}
        placeholder="选择班主任（仅展示有 class_master 角色的用户）"
        value={node.leader_id ?? undefined}
        options={classMasters.map((u) => ({
          label: `${u.real_name}（${u.username}）`,
          value: u.id,
        }))}
        onChange={(v) => setMut.mutate(v ?? null)}
        allowClear
        onClear={() => setMut.mutate(null)}
        showSearch
        optionFilterProp="label"
      />
      {node.leader_name && (
        <Tag color="blue" style={{ margin: 0 }}>
          当前：{node.leader_name}
        </Tag>
      )}
    </div>
  );
}

function CounselorListCard({
  node,
  counselors,
  onChange,
  helperText,
}: {
  node: OrgTreeNode;
  counselors: AssignableUser[];
  onChange: () => void;
  helperText: string;
}) {
  const [pickValue, setPickValue] = useState<string | null>(null);
  const [primary, setPrimary] = useState(false);

  // 已在该节点挂过的人不出现在下拉里。
  const alreadyMappedIds = new Set(node.counselors.map((m) => m.counselor_id));
  const candidateOptions = counselors
    .filter((u) => !alreadyMappedIds.has(u.id))
    .map((u) => ({ label: `${u.real_name}（${u.username}）`, value: u.id }));

  const addMut = useMutation({
    mutationFn: () =>
      createCounselorMapping({
        counselorId: pickValue!,
        orgId: node.id,
        isPrimary: primary,
      }),
    onSuccess: () => {
      message.success('已添加辅导员');
      setPickValue(null);
      setPrimary(false);
      onChange();
    },
    onError: (e: unknown) =>
      message.error(`添加失败：${e instanceof Error ? e.message : String(e)}`),
  });

  return (
    <Card
      size="small"
      title={`辅导员（${node.counselors.length} 人）`}
      style={{ borderRadius: 'var(--r-lg)' }}
    >
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>{helperText}</div>

      {node.counselors.length === 0 ? (
        <div style={{ color: 'var(--fg-3)', fontSize: 13, padding: '8px 0' }}>
          尚未挂任何辅导员
        </div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {node.counselors.map((m) => (
            <CounselorRow key={m.id} mapping={m} onChange={onChange} />
          ))}
        </Space>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px dashed var(--border-1, #e5e7eb)',
        }}
      >
        <Select
          style={{ flex: 1 }}
          placeholder="选辅导员加入（仅展示有 counselor 角色的用户）"
          value={pickValue ?? undefined}
          options={candidateOptions}
          onChange={(v) => setPickValue(v)}
          showSearch
          optionFilterProp="label"
          allowClear
        />
        <Button
          type={primary ? 'primary' : 'default'}
          icon={primary ? <StarFilled /> : <StarOutlined />}
          onClick={() => setPrimary((p) => !p)}
        >
          {primary ? '主辅导员' : '副辅导员'}
        </Button>
        <Button
          type="primary"
          disabled={pickValue == null}
          loading={addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          添加
        </Button>
      </div>
    </Card>
  );
}

function CounselorRow({
  mapping,
  onChange,
}: {
  mapping: CounselorMapping;
  onChange: () => void;
}) {
  const togglePrimaryMut = useMutation({
    mutationFn: () => updateMappingPrimary(mapping.id, !mapping.is_primary),
    onSuccess: () => {
      message.success(mapping.is_primary ? '已改为副辅导员' : '已改为主辅导员');
      onChange();
    },
    onError: (e: unknown) =>
      message.error(`修改失败：${e instanceof Error ? e.message : String(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCounselorMapping(mapping.id),
    onSuccess: () => {
      message.success('已移除');
      onChange();
    },
    onError: (e: unknown) =>
      message.error(`移除失败：${e instanceof Error ? e.message : String(e)}`),
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: 'var(--bg-2, #f7f7f8)',
        borderRadius: 6,
      }}
    >
      <span style={{ flex: 1 }}>{mapping.counselor_name}</span>
      <Button
        size="small"
        type={mapping.is_primary ? 'primary' : 'text'}
        icon={mapping.is_primary ? <StarFilled /> : <StarOutlined />}
        loading={togglePrimaryMut.isPending}
        onClick={() => togglePrimaryMut.mutate()}
      >
        {mapping.is_primary ? '主辅导员' : '副辅导员'}
      </Button>
      <Popconfirm
        title="移除该辅导员？"
        onConfirm={() => deleteMut.mutate()}
        okText="移除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </div>
  );
}

// ---------- helpers ----------

interface AntdTreeNode {
  key: string;
  title: React.ReactNode;
  children?: AntdTreeNode[];
}

function buildAntdTree(flat: OrgTreeNode[]): AntdTreeNode[] {
  const byParent = new Map<string | null, OrgTreeNode[]>();
  for (const n of flat) {
    const p = n.parent_id ?? null;
    const arr = byParent.get(p) ?? [];
    arr.push(n);
    byParent.set(p, arr);
  }

  function build(parentId: string | null): AntdTreeNode[] {
    return (byParent.get(parentId) ?? []).map((n) => ({
      key: n.id,
      title: <NodeLabel node={n} />,
      children: build(n.id),
    }));
  }
  return build(null);
}

function NodeLabel({ node }: { node: OrgTreeNode }) {
  const isClass = node.type === 'class';
  const needsLeader = isClass && node.leader_id == null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{isClass ? '🏫' : '🎓'}</span>
      <span>{node.name}</span>
      {needsLeader && (
        <Tag color="error" style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
          缺班主任
        </Tag>
      )}
      {node.counselors.length > 0 && (
        <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
          {node.counselors.length} 辅导员
        </Tag>
      )}
    </span>
  );
}
