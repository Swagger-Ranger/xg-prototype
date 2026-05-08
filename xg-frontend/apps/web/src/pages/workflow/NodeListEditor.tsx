// Form-driven editor for the workflow's `nodes` array. Hides YAML behind a
// per-node card list + a side drawer for type-specific properties. The
// caller controls value via the `value` / `onChange` props (same pattern
// as antd's Form.Item internals).
import { useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Input,
  Select,
  InputNumber,
  Tag,
  Space,
  Tooltip,
  Popconfirm,
  Empty,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  CheckSquareOutlined,
  BranchesOutlined,
  EditOutlined as FormSubmitIcon,
  FlagOutlined,
  BellOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import type {
  ApprovalNode,
  ConditionBranch,
  ConditionNode,
  EndNode,
  FlowNode,
  FormSubmitNode,
  NodeScope,
  NodeType,
  NotificationNode,
  PublicityNode,
} from './dsl';
import { makeDefaultNode, nodeTypeLabel, scopeLabel } from './dsl';
import type { RoleCode } from '@/api/workflow';
import styles from './NodeListEditor.module.css';

interface Props {
  value: FlowNode[];
  onChange: (next: FlowNode[]) => void;
  /** Available sys_role codes for approval assignee Select. */
  roleCodes: RoleCode[];
  /** Top-level start id; needed so we can offer it as a `next` target. */
  startId: string;
}

const TYPE_ICON: Record<NodeType, React.ReactNode> = {
  form_submit: <FormSubmitIcon />,
  approval: <CheckSquareOutlined />,
  condition: <BranchesOutlined />,
  publicity: <FieldTimeOutlined />,
  notification: <BellOutlined />,
  end: <FlagOutlined />,
};

const SCOPE_OPTIONS: { value: NodeScope; label: string }[] = [
  { value: 'same_class', label: '同班' },
  { value: 'same_college', label: '同学院' },
  { value: 'global', label: '全校' },
];

const TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'approval', label: '审批节点' },
  { value: 'condition', label: '分支判断' },
  { value: 'end', label: '终态节点' },
  { value: 'notification', label: '通知节点' },
  { value: 'publicity', label: '公示期' },
  { value: 'form_submit', label: '表单提交' },
];

export default function NodeListEditor({ value, onChange, roleCodes, startId }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const idNameMap = useMemo(
    () => new Map(value.map((n) => [n.id, n.name ?? n.id])),
    [value],
  );

  const handleAdd = (type: NodeType) => {
    const ids = new Set(value.map((n) => n.id));
    const next = makeDefaultNode(type, ids);
    onChange([...value, next]);
    setEditingIdx(value.length);
  };

  const handleDelete = (idx: number) => {
    const node = value[idx];
    if (node.id === startId) return; // protected (UI prevents it; defensive)
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const handleNodeChange = (idx: number, patch: Partial<FlowNode>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch } as FlowNode;
    onChange(next);
  };

  return (
    <div className={styles.wrap}>
      {value.length === 0 ? (
        <Empty description="暂无节点" />
      ) : (
        <div className={styles.list}>
          {value.map((node, idx) => (
            <NodeCard
              key={node.id + idx}
              node={node}
              idNameMap={idNameMap}
              isStart={node.id === startId}
              isFirst={idx === 0}
              isLast={idx === value.length - 1}
              onEdit={() => setEditingIdx(idx)}
              onDelete={() => handleDelete(idx)}
              onMoveUp={() => handleMove(idx, -1)}
              onMoveDown={() => handleMove(idx, 1)}
            />
          ))}
        </div>
      )}

      <div className={styles.addBar}>
        <Space wrap>
          {TYPE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAdd(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </Space>
      </div>

      <NodeDrawer
        node={editingIdx != null ? value[editingIdx] : null}
        otherNodes={value.filter((_, i) => i !== editingIdx)}
        roleCodes={roleCodes}
        onChange={(patch) => editingIdx != null && handleNodeChange(editingIdx, patch)}
        onClose={() => setEditingIdx(null)}
      />
    </div>
  );
}

// ----------------------------- NodeCard -----------------------------

interface NodeCardProps {
  node: FlowNode;
  idNameMap: Map<string, string>;
  isStart: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function NodeCard({
  node,
  idNameMap,
  isStart,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: NodeCardProps) {
  return (
    <div className={`${styles.card} ${styles[`type_${node.type}`] ?? ''}`}>
      <div className={styles.cardLeft}>
        <span className={styles.cardIcon}>{TYPE_ICON[node.type]}</span>
      </div>
      <div className={styles.cardMain}>
        <div className={styles.cardHead}>
          <span className={styles.cardName}>{node.name ?? node.id}</span>
          <Tag bordered={false} color="default" className={styles.typeTag}>
            {nodeTypeLabel(node.type)}
          </Tag>
          {isStart && (
            <Tag bordered={false} color="cyan" className={styles.typeTag}>
              起始
            </Tag>
          )}
          <code className={styles.cardId}>{node.id}</code>
        </div>
        <div className={styles.cardSummary}>
          <NodeSummary node={node} idNameMap={idNameMap} />
        </div>
      </div>
      <div className={styles.cardActions}>
        <Tooltip title="编辑">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={onEdit} />
        </Tooltip>
        <Tooltip title="上移">
          <Button
            size="small"
            type="text"
            icon={<ArrowUpOutlined />}
            disabled={isFirst}
            onClick={onMoveUp}
          />
        </Tooltip>
        <Tooltip title="下移">
          <Button
            size="small"
            type="text"
            icon={<ArrowDownOutlined />}
            disabled={isLast}
            onClick={onMoveDown}
          />
        </Tooltip>
        <Popconfirm
          title="确认删除该节点？"
          description={isStart ? '起始节点不能删除' : '其他节点引用它的 next 也需要同步修改'}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true, disabled: isStart }}
          onConfirm={() => !isStart && onDelete()}
        >
          <Tooltip title={isStart ? '起始节点不能删除' : '删除'}>
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={isStart}
            />
          </Tooltip>
        </Popconfirm>
      </div>
    </div>
  );
}

function NodeSummary({
  node,
  idNameMap,
}: {
  node: FlowNode;
  idNameMap: Map<string, string>;
}) {
  const labelOf = (id: string | undefined) => {
    if (!id) return <span className={styles.muted}>未配置</span>;
    return <span>{idNameMap.get(id) ?? id}</span>;
  };
  switch (node.type) {
    case 'form_submit':
      return <span>下一节点：{labelOf(node.next)}</span>;
    case 'approval':
      return (
        <Space size={6} wrap>
          <span>
            角色：<strong>{node.assignee.role}</strong>
            <span className={styles.muted}>（{scopeLabel(node.assignee.scope)}）</span>
          </span>
          {node.timeout?.duration && (
            <span>
              超时：<strong>{node.timeout.duration}</strong>
            </span>
          )}
          <span>通过 → {labelOf(node.next)}</span>
          {node.rejected_next && <span>驳回 → {labelOf(node.rejected_next)}</span>}
        </Space>
      );
    case 'condition':
      return (
        <Space size={4} direction="vertical" style={{ display: 'flex' }}>
          {node.branches.map((b, i) => (
            <span key={i}>
              <code className={styles.codeMuted}>{b.when}</code> → {labelOf(b.next)}
            </span>
          ))}
        </Space>
      );
    case 'publicity':
      return (
        <Space size={6} wrap>
          <span>
            公示：<strong>{node.publicity.duration}</strong>
          </span>
          <span>到期 → {labelOf(node.next)}</span>
          {node.interrupt_on && (
            <span>
              异议（<code>{node.interrupt_on.event}</code>）→ {labelOf(node.interrupt_on.next)}
            </span>
          )}
        </Space>
      );
    case 'notification':
      return <span>下一节点：{labelOf(node.next)}</span>;
    case 'end':
      return (
        <Tag color={node.status === 'rejected' ? 'red' : 'green'} bordered={false}>
          {node.status}
        </Tag>
      );
  }
}

// ----------------------------- NodeDrawer -----------------------------

interface DrawerProps {
  node: FlowNode | null;
  otherNodes: FlowNode[];
  roleCodes: RoleCode[];
  onChange: (patch: Partial<FlowNode>) => void;
  onClose: () => void;
}

function NodeDrawer({ node, otherNodes, roleCodes, onChange, onClose }: DrawerProps) {
  if (!node) return null;
  const open = node !== null;

  // "next" target options: any other node's id (exclude self)
  const targetOptions = otherNodes.map((n) => ({
    value: n.id,
    label: `${n.name ?? n.id} (${n.id})`,
  }));

  // Approval role options: union of sys_role codes (rich label) — fall back
  // to letting the user type a code if the role catalog is empty.
  const roleOptions = roleCodes.map((r) => ({
    value: r.code,
    label: `${r.name} (${r.code})`,
  }));

  return (
    <Drawer
      title={`编辑节点 — ${node.name ?? node.id}`}
      open={open}
      onClose={onClose}
      width={420}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label="节点 ID（唯一标识，建议英文）">
          <Input
            value={node.id}
            onChange={(e) => onChange({ id: e.target.value } as Partial<FlowNode>)}
          />
        </Form.Item>
        <Form.Item label="节点名称（流程图显示）">
          <Input
            value={node.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value } as Partial<FlowNode>)}
            placeholder="如 辅导员审批"
          />
        </Form.Item>

        {node.type === 'approval' && (
          <ApprovalFields
            node={node}
            roleOptions={roleOptions}
            targetOptions={targetOptions}
            onChange={onChange}
          />
        )}
        {node.type === 'condition' && (
          <ConditionFields
            node={node}
            targetOptions={targetOptions}
            onChange={onChange}
          />
        )}
        {node.type === 'publicity' && (
          <PublicityFields
            node={node}
            targetOptions={targetOptions}
            onChange={onChange}
          />
        )}
        {(node.type === 'form_submit' || node.type === 'notification') && (
          <SimpleNextField
            node={node}
            targetOptions={targetOptions}
            onChange={onChange}
          />
        )}
        {node.type === 'end' && (
          <EndFields node={node} onChange={onChange} />
        )}
      </Form>
    </Drawer>
  );
}

function ApprovalFields({
  node,
  roleOptions,
  targetOptions,
  onChange,
}: {
  node: ApprovalNode;
  roleOptions: { value: string; label: string }[];
  targetOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FlowNode>) => void;
}) {
  return (
    <>
      <Form.Item label="审批角色" required>
        <Select
          showSearch
          options={roleOptions}
          value={node.assignee.role || undefined}
          placeholder="如 counselor / dean"
          onChange={(role: string) =>
            onChange({ assignee: { ...node.assignee, role } } as Partial<FlowNode>)
          }
        />
      </Form.Item>
      <Form.Item label="范围" required>
        <Select
          options={SCOPE_OPTIONS}
          value={node.assignee.scope}
          onChange={(scope: NodeScope) =>
            onChange({ assignee: { ...node.assignee, scope } } as Partial<FlowNode>)
          }
        />
      </Form.Item>
      <Form.Item label="超时时长（如 48h / 3d / 30m）">
        <Input
          value={node.timeout?.duration ?? ''}
          placeholder="48h"
          onChange={(e) =>
            onChange({
              timeout: e.target.value ? { duration: e.target.value } : undefined,
            } as Partial<FlowNode>)
          }
        />
      </Form.Item>
      <Form.Item label="通过后下一节点" required>
        <Select
          options={targetOptions}
          value={node.next || undefined}
          onChange={(v: string) => onChange({ next: v } as Partial<FlowNode>)}
          placeholder="选择节点"
        />
      </Form.Item>
      <Form.Item label="驳回后下一节点">
        <Select
          allowClear
          options={targetOptions}
          value={node.rejected_next || undefined}
          onChange={(v: string | undefined) =>
            onChange({ rejected_next: v ?? '' } as Partial<FlowNode>)
          }
          placeholder="留空表示直接结束"
        />
      </Form.Item>
    </>
  );
}

function ConditionFields({
  node,
  targetOptions,
  onChange,
}: {
  node: ConditionNode;
  targetOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FlowNode>) => void;
}) {
  const updateBranches = (next: ConditionBranch[]) =>
    onChange({ branches: next } as Partial<FlowNode>);

  const handleEdit = (i: number, patch: Partial<ConditionBranch>) => {
    const next = [...node.branches];
    next[i] = { ...next[i], ...patch };
    updateBranches(next);
  };

  return (
    <>
      <Form.Item label="分支条件" required>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {node.branches.map((b, i) => (
            <div key={i} className={styles.branchEdit}>
              <Input
                placeholder="如 duration_days >= 3 或 default"
                value={b.when}
                onChange={(e) => handleEdit(i, { when: e.target.value })}
              />
              <Select
                options={targetOptions}
                value={b.next || undefined}
                onChange={(v: string) => handleEdit(i, { next: v })}
                placeholder="目标节点"
                style={{ minWidth: 160 }}
              />
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => updateBranches(node.branches.filter((_, j) => j !== i))}
                disabled={node.branches.length <= 1}
              />
            </div>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              updateBranches([...node.branches, { when: 'default', next: '' }])
            }
          >
            添加分支
          </Button>
        </Space>
      </Form.Item>
      <p className={styles.muted}>
        条件表达式只支持内置变量（如 <code>duration_days</code>）和受限运算符；
        最后一条建议留 <code>default</code> 兜底。
      </p>
    </>
  );
}

function PublicityFields({
  node,
  targetOptions,
  onChange,
}: {
  node: PublicityNode;
  targetOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FlowNode>) => void;
}) {
  return (
    <>
      <Form.Item label="公示期时长（如 7d / 48h）" required>
        <Input
          value={node.publicity.duration}
          onChange={(e) =>
            onChange({
              publicity: { duration: e.target.value },
            } as Partial<FlowNode>)
          }
        />
      </Form.Item>
      <Form.Item label="到期后下一节点" required>
        <Select
          options={targetOptions}
          value={node.next || undefined}
          onChange={(v: string) => onChange({ next: v } as Partial<FlowNode>)}
        />
      </Form.Item>
    </>
  );
}

function SimpleNextField({
  node,
  targetOptions,
  onChange,
}: {
  node: FormSubmitNode | NotificationNode;
  targetOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FlowNode>) => void;
}) {
  return (
    <Form.Item label="下一节点" required>
      <Select
        options={targetOptions}
        value={node.next || undefined}
        onChange={(v: string) => onChange({ next: v } as Partial<FlowNode>)}
        placeholder="选择目标节点"
      />
    </Form.Item>
  );
}

function EndFields({
  node,
  onChange,
}: {
  node: EndNode;
  onChange: (patch: Partial<FlowNode>) => void;
}) {
  return (
    <Form.Item label="终态" required>
      <Select
        options={[
          { value: 'completed', label: '通过 (completed)' },
          { value: 'rejected', label: '驳回 (rejected)' },
        ]}
        value={node.status}
        onChange={(status: 'completed' | 'rejected') =>
          onChange({ status } as Partial<FlowNode>)
        }
      />
    </Form.Item>
  );
}

// Force the unused InputNumber import to keep tree-shaking honest if we add
// numeric fields later (e.g. seats / quota for publicity).
void InputNumber;
