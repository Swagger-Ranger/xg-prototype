import { useMemo } from 'react';
import {
  EditOutlined,
  CheckSquareOutlined,
  BranchesOutlined,
  BellOutlined,
  FieldTimeOutlined,
  FlagOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import type { WorkflowDefinition } from '@xg1/shared';
import type { RoleCode } from '@/api/workflow';
import styles from './WorkflowPreview.module.css';

const SCOPE_LABELS: Record<string, string> = {
  same_class: '同班',
  same_college: '同学院',
  global: '全校',
};

const NODE_TYPE_META: Record<
  string,
  { icon: React.ReactNode; label: string; tone: string }
> = {
  form_submit: { icon: <EditOutlined />, label: '提交', tone: 'cyan' },
  approval: { icon: <CheckSquareOutlined />, label: '审批', tone: 'indigo' },
  condition: { icon: <BranchesOutlined />, label: '分支', tone: 'amber' },
  notification: { icon: <BellOutlined />, label: '通知', tone: 'cyan' },
  publicity: { icon: <FieldTimeOutlined />, label: '公示', tone: 'purple' },
  end: { icon: <FlagOutlined />, label: '终态', tone: 'gray' },
};

interface RawNode {
  id: string;
  type?: string;
  name?: string;
  next?: string;
  rejected_next?: string;
  assignee?: { role?: string; scope?: string };
  timeout?: { duration?: string };
  branches?: { when?: string; next?: string; display_label?: string }[];
  publicity?: { duration?: string };
  interrupt_on?: { event?: string; next?: string };
  status?: string; // for end node
}

interface Props {
  definition: WorkflowDefinition;
  roleCodes: RoleCode[];
}

export default function WorkflowPreview({ definition, roleCodes }: Props) {
  const roleMap = useMemo(
    () => new Map(roleCodes.map((r) => [r.code, r.name])),
    [roleCodes],
  );

  const json = definition.config_json as Record<string, unknown>;
  const rawNodes = (Array.isArray(json?.nodes) ? json.nodes : []) as RawNode[];
  const nodeNameMap = useMemo(
    () => new Map(rawNodes.map((n) => [n.id, n.name ?? n.id])),
    [rawNodes],
  );

  if (rawNodes.length === 0) {
    return <div className={styles.empty}>定义中没有 nodes，无法可视化。</div>;
  }

  return (
    <div className={styles.preview}>
      <div className={styles.metaBar}>
        <span>
          <span className={styles.metaLabel}>code</span>
          <code>{definition.code}</code>
        </span>
        <span>
          <span className={styles.metaLabel}>版本</span>
          <Tag color="blue" style={{ margin: 0 }}>v{definition.version}</Tag>
        </span>
        <span>
          <span className={styles.metaLabel}>biz_type</span>
          <code>{definition.biz_type ?? '—'}</code>
        </span>
      </div>

      <div className={styles.flow}>
        {rawNodes.map((node, idx) => (
          <NodeCardConnector key={node.id}>
            <NodeCard node={node} roleMap={roleMap} nodeNameMap={nodeNameMap} />
            {idx < rawNodes.length - 1 && (
              <div className={styles.connector}>
                <ArrowDownOutlined />
              </div>
            )}
          </NodeCardConnector>
        ))}
      </div>
    </div>
  );
}

function NodeCardConnector({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function NodeCard({
  node,
  roleMap,
  nodeNameMap,
}: {
  node: RawNode;
  roleMap: Map<string, string>;
  nodeNameMap: Map<string, string>;
}) {
  const meta = NODE_TYPE_META[node.type ?? ''] ?? {
    icon: <FlagOutlined />,
    label: node.type ?? '?',
    tone: 'gray',
  };

  return (
    <div className={`${styles.card} ${styles[`tone_${meta.tone}`]}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{meta.icon}</span>
        <span className={styles.cardTitle}>{node.name ?? node.id}</span>
        <span className={styles.cardTypeTag}>{meta.label}</span>
        <span className={styles.cardId}><code>{node.id}</code></span>
      </div>

      {node.type === 'approval' && (
        <ApprovalBody node={node} roleMap={roleMap} nodeNameMap={nodeNameMap} />
      )}
      {node.type === 'condition' && (
        <ConditionBody node={node} nodeNameMap={nodeNameMap} />
      )}
      {node.type === 'publicity' && (
        <PublicityBody node={node} nodeNameMap={nodeNameMap} />
      )}
      {node.type === 'notification' && (
        <NotificationBody node={node} nodeNameMap={nodeNameMap} />
      )}
      {node.type === 'end' && (
        <EndBody node={node} />
      )}
      {node.type === 'form_submit' && node.next && (
        <div className={styles.kvRow}>
          <span className={styles.k}>下一节点</span>
          <span className={styles.v}>{nodeNameMap.get(node.next) ?? node.next}</span>
        </div>
      )}
    </div>
  );
}

function ApprovalBody({
  node,
  roleMap,
  nodeNameMap,
}: {
  node: RawNode;
  roleMap: Map<string, string>;
  nodeNameMap: Map<string, string>;
}) {
  const role = node.assignee?.role;
  const scope = node.assignee?.scope;
  return (
    <div className={styles.body}>
      <div className={styles.kvRow}>
        <span className={styles.k}>审批角色</span>
        <span className={styles.v}>
          {role ? (
            <>
              {roleMap.get(role) ?? role}
              <code className={styles.codeMuted}>{role}</code>
            </>
          ) : '—'}
        </span>
      </div>
      {scope && (
        <div className={styles.kvRow}>
          <span className={styles.k}>范围</span>
          <span className={styles.v}>{SCOPE_LABELS[scope] ?? scope}</span>
        </div>
      )}
      {node.timeout?.duration && (
        <div className={styles.kvRow}>
          <span className={styles.k}>超时</span>
          <span className={styles.v}>{formatDuration(node.timeout.duration)}</span>
        </div>
      )}
      <div className={styles.kvRow}>
        <span className={styles.k}>通过 →</span>
        <span className={styles.v}>{labelOf(node.next, nodeNameMap)}</span>
      </div>
      {node.rejected_next && (
        <div className={styles.kvRow}>
          <span className={`${styles.k} ${styles.kReject}`}>驳回 →</span>
          <span className={styles.v}>{labelOf(node.rejected_next, nodeNameMap)}</span>
        </div>
      )}
    </div>
  );
}

function ConditionBody({
  node,
  nodeNameMap,
}: {
  node: RawNode;
  nodeNameMap: Map<string, string>;
}) {
  const branches = node.branches ?? [];
  return (
    <div className={styles.body}>
      <div className={styles.branchList}>
        {branches.map((b, i) => {
          const isDefault = b.when === 'default' || b.when === undefined || b.when === null;
          return (
            <div key={i} className={styles.branchRow}>
              <span className={styles.branchWhen}>
                {b.display_label ?? (isDefault ? '默认' : <code>{b.when}</code>)}
              </span>
              <span className={styles.branchArrow}>→</span>
              <span className={styles.branchTarget}>{labelOf(b.next, nodeNameMap)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicityBody({
  node,
  nodeNameMap,
}: {
  node: RawNode;
  nodeNameMap: Map<string, string>;
}) {
  const dur = node.publicity?.duration;
  const interrupt = node.interrupt_on;
  return (
    <div className={styles.body}>
      <div className={styles.kvRow}>
        <span className={styles.k}>公示期</span>
        <span className={styles.v}>
          {dur ? formatDuration(dur) : <em>未配置</em>}
          <span className={styles.codeMuted}>到期自动进入下一节点</span>
        </span>
      </div>
      <div className={styles.kvRow}>
        <span className={styles.k}>到期 →</span>
        <span className={styles.v}>{labelOf(node.next, nodeNameMap)}</span>
      </div>
      {interrupt && (
        <div className={styles.kvRow}>
          <span className={styles.k}>异议入口</span>
          <span className={styles.v}>
            {interrupt.event && <code className={styles.codeMuted}>{interrupt.event}</code>}
            <span className={styles.branchArrow}>→</span>
            {labelOf(interrupt.next, nodeNameMap)}
          </span>
        </div>
      )}
    </div>
  );
}

function NotificationBody({
  node,
  nodeNameMap,
}: {
  node: RawNode;
  nodeNameMap: Map<string, string>;
}) {
  return (
    <div className={styles.body}>
      <div className={styles.kvRow}>
        <span className={styles.k}>下一节点</span>
        <span className={styles.v}>{labelOf(node.next, nodeNameMap)}</span>
      </div>
    </div>
  );
}

function EndBody({ node }: { node: RawNode }) {
  const status = node.status ?? 'completed';
  const tone =
    status === 'completed' ? 'green' :
    status === 'rejected' ? 'red' :
    'default';
  return (
    <div className={styles.body}>
      <div className={styles.kvRow}>
        <span className={styles.k}>终态</span>
        <span className={styles.v}>
          <Tag color={tone} style={{ margin: 0 }}>{status}</Tag>
        </span>
      </div>
    </div>
  );
}

function labelOf(id: string | undefined, nodeNameMap: Map<string, string>) {
  if (!id) return <em>—</em>;
  const name = nodeNameMap.get(id);
  return (
    <>
      <span>{name ?? id}</span>
      {name && <code className={styles.codeMuted}>{id}</code>}
    </>
  );
}

function formatDuration(s: string): string {
  const m = s.match(/^(\d+)([hdm])$/);
  if (!m) return s;
  const n = m[1];
  const unit = m[2];
  return `${n} ${unit === 'h' ? '小时' : unit === 'd' ? '天' : '分钟'}`;
}
