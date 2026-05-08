// React Flow-based workflow visualizer. Renders the same DSL shape that the
// editor mutates, so the chart updates live as the user (or AI) changes nodes.
//
// Edge semantics:
//   approval.next            → solid, green, label="通过"
//   approval.rejected_next   → dashed, red, label="驳回"
//   condition.branches[i]    → solid, amber, label=display_label || when
//   publicity.interrupt_on   → dashed, orange, label="异议: <event>"
//   everything else (.next)  → solid, gray, no label
import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Node as RFNode,
  type Edge as RFEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  EditOutlined,
  CheckSquareOutlined,
  BranchesOutlined,
  BellOutlined,
  FieldTimeOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import type { FlowDsl, FlowNode } from './dsl';
import type { RoleCode } from '@/api/workflow';
import styles from './WorkflowFlowChart.module.css';

const NODE_W = 220;
const NODE_H = 90;

const TYPE_META: Record<
  string,
  { icon: React.ReactNode; tone: string; label: string }
> = {
  form_submit: { icon: <EditOutlined />, tone: 'cyan', label: '提交' },
  approval: { icon: <CheckSquareOutlined />, tone: 'indigo', label: '审批' },
  condition: { icon: <BranchesOutlined />, tone: 'amber', label: '分支' },
  publicity: { icon: <FieldTimeOutlined />, tone: 'purple', label: '公示' },
  notification: { icon: <BellOutlined />, tone: 'cyan', label: '通知' },
  end: { icon: <FlagOutlined />, tone: 'gray', label: '终态' },
};

const NODE_TYPES = { card: NodeCard };

const SCOPE_LABEL: Record<string, string> = {
  same_class: '同班',
  same_college: '同学院',
  global: '全校',
};

interface Props {
  dsl: FlowDsl;
  roleCodes: RoleCode[];
  height?: number | string;
}

export default function WorkflowFlowChart({ dsl, roleCodes, height = 420 }: Props) {
  const roleMap = useMemo(
    () => new Map(roleCodes.map((r) => [r.code, r.name])),
    [roleCodes],
  );

  const { nodes, edges } = useMemo(() => buildGraph(dsl, roleMap), [dsl, roleMap]);

  if (nodes.length === 0) {
    return <div className={styles.empty}>定义中没有 nodes，无法可视化。</div>;
  }

  return (
    <div className={styles.wrap} style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// ---- node renderer ----

function NodeCard({ data }: { data: NodeData }) {
  const meta = TYPE_META[data.type] ?? TYPE_META.end;
  const isStart = data.type === 'form_submit';
  const isEnd = data.type === 'end';
  return (
    <div className={`${styles.card} ${styles[`tone_${meta.tone}`]}`}>
      {!isStart && <Handle type="target" position={Position.Top} className={styles.handle} />}
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{meta.icon}</span>
        <span className={styles.cardTitle} title={data.title}>
          {data.title}
        </span>
        <span className={styles.cardTypeTag}>{meta.label}</span>
      </div>
      {data.subtitle && <div className={styles.cardSub}>{data.subtitle}</div>}
      {!isEnd && <Handle type="source" position={Position.Bottom} className={styles.handle} />}
    </div>
  );
}

// ---- graph construction ----

interface NodeData extends Record<string, unknown> {
  type: string;
  title: string;
  subtitle?: string;
}

function buildGraph(
  dsl: FlowDsl,
  roleMap: Map<string, string>,
): { nodes: RFNode<NodeData>[]; edges: RFEdge[] } {
  const rfNodes: RFNode<NodeData>[] = dsl.nodes.map((n) => ({
    id: n.id,
    type: 'card',
    data: {
      type: n.type,
      title: n.name ?? n.id,
      subtitle: subtitleFor(n, roleMap),
    },
    position: { x: 0, y: 0 }, // dagre fills this in
    width: NODE_W,
    height: NODE_H,
  }));

  const rfEdges: RFEdge[] = [];
  for (const n of dsl.nodes) {
    switch (n.type) {
      case 'form_submit':
      case 'notification':
        if (n.next) rfEdges.push(plainEdge(n.id, n.next));
        break;
      case 'approval':
        if (n.next) rfEdges.push(approveEdge(n.id, n.next));
        if (n.rejected_next) rfEdges.push(rejectEdge(n.id, n.rejected_next));
        break;
      case 'condition':
        n.branches.forEach((b, i) => {
          if (!b.next) return;
          const isDefault = b.when === 'default';
          const label = b.display_label ?? (isDefault ? '默认' : b.when);
          rfEdges.push(branchEdge(n.id, b.next, `b${i}`, label));
        });
        break;
      case 'publicity':
        if (n.next) rfEdges.push(plainEdge(n.id, n.next, '到期'));
        if (n.interrupt_on?.next) {
          rfEdges.push(
            interruptEdge(n.id, n.interrupt_on.next, `异议: ${n.interrupt_on.event}`),
          );
        }
        break;
      case 'end':
        break;
    }
  }

  layout(rfNodes, rfEdges);
  return { nodes: rfNodes, edges: rfEdges };
}

function subtitleFor(n: FlowNode, roleMap: Map<string, string>): string | undefined {
  switch (n.type) {
    case 'approval': {
      const role = roleMap.get(n.assignee.role) ?? n.assignee.role;
      const scope = SCOPE_LABEL[n.assignee.scope] ?? n.assignee.scope;
      const t = n.timeout?.duration ? `· ${formatDuration(n.timeout.duration)}` : '';
      return `${role} · ${scope} ${t}`.trim();
    }
    case 'publicity':
      return n.publicity?.duration ? `公示 ${formatDuration(n.publicity.duration)}` : undefined;
    case 'end':
      return n.status === 'completed' ? '已通过' : '已驳回';
    case 'condition':
      return `${n.branches.length} 个分支`;
    default:
      return undefined;
  }
}

function formatDuration(s: string): string {
  const m = s.match(/^(\d+)([hdm])$/);
  if (!m) return s;
  return `${m[1]}${m[2] === 'h' ? '小时' : m[2] === 'd' ? '天' : '分钟'}`;
}

// ---- edge factories ----

// Shared label pill style — opaque background + padding so labels never sit
// directly on top of edges or other nodes.
const LABEL_BG = {
  fill: '#ffffff',
  fillOpacity: 0.95,
} as const;
const LABEL_PAD: [number, number] = [8, 4];
const LABEL_RADIUS = 4;

function plainEdge(source: string, target: string, label?: string): RFEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    label,
    type: 'smoothstep',
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgStyle: LABEL_BG,
    labelBgPadding: LABEL_PAD,
    labelBgBorderRadius: LABEL_RADIUS,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
  };
}

function approveEdge(source: string, target: string): RFEdge {
  return {
    id: `${source}->${target}:ok`,
    source,
    target,
    label: '通过',
    type: 'smoothstep',
    style: { stroke: '#16a34a', strokeWidth: 1.8 },
    labelStyle: { fontSize: 11, fill: '#15803d', fontWeight: 600 },
    labelBgStyle: { fill: '#f0fdf4', fillOpacity: 0.95 },
    labelBgPadding: LABEL_PAD,
    labelBgBorderRadius: LABEL_RADIUS,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#16a34a', width: 18, height: 18 },
  };
}

function rejectEdge(source: string, target: string): RFEdge {
  return {
    id: `${source}->${target}:rej`,
    source,
    target,
    label: '驳回',
    type: 'smoothstep',
    style: { stroke: '#dc2626', strokeWidth: 1.6, strokeDasharray: '6 4' },
    labelStyle: { fontSize: 11, fill: '#b91c1c', fontWeight: 600 },
    labelBgStyle: { fill: '#fef2f2', fillOpacity: 0.95 },
    labelBgPadding: LABEL_PAD,
    labelBgBorderRadius: LABEL_RADIUS,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626', width: 18, height: 18 },
  };
}

function branchEdge(source: string, target: string, key: string, label: string): RFEdge {
  return {
    id: `${source}->${target}:${key}`,
    source,
    target,
    label,
    type: 'smoothstep',
    style: { stroke: '#d97706', strokeWidth: 1.6 },
    labelStyle: { fontSize: 11, fill: '#92400e', fontWeight: 500 },
    labelBgStyle: { fill: '#fffbeb', fillOpacity: 0.95 },
    labelBgPadding: LABEL_PAD,
    labelBgBorderRadius: LABEL_RADIUS,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706', width: 18, height: 18 },
  };
}

function interruptEdge(source: string, target: string, label: string): RFEdge {
  return {
    id: `${source}->${target}:int`,
    source,
    target,
    label,
    type: 'smoothstep',
    style: { stroke: '#ea580c', strokeWidth: 1.4, strokeDasharray: '4 3' },
    labelStyle: { fontSize: 11, fill: '#9a3412' },
    labelBgStyle: { fill: '#fff7ed', fillOpacity: 0.95 },
    labelBgPadding: LABEL_PAD,
    labelBgBorderRadius: LABEL_RADIUS,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ea580c', width: 16, height: 16 },
  };
}

// ---- dagre layout ----

function layout(nodes: RFNode<NodeData>[], edges: RFEdge[]): void {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // ranksep: vertical breathing room so edge labels don't crowd nodes.
  // nodesep: horizontal spread for condition branches / approval reject path.
  // edgesep: gap between parallel edges sharing the same rank pair.
  g.setGraph({
    rankdir: 'TB',
    nodesep: 70,
    ranksep: 110,
    edgesep: 24,
    marginx: 24,
    marginy: 24,
    ranker: 'tight-tree',
  });
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  for (const n of nodes) {
    const p = g.node(n.id);
    n.position = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  }
}

