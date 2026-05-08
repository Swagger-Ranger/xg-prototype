// Domain types + parse/serialize for the workflow DSL the backend expects.
// We deliberately keep the public surface narrow: the new node-list editor
// only manipulates `nodes`; everything else (form, code, module, start) is
// treated as opaque pass-through so other editors (e.g. FormFieldsEditor)
// stay the source of truth for their own slice.
import yaml from 'js-yaml';

export type NodeType =
  | 'form_submit'
  | 'approval'
  | 'condition'
  | 'publicity'
  | 'notification'
  | 'end';

export type NodeScope = 'same_class' | 'same_college' | 'global';
export type EndStatus = 'completed' | 'rejected';

export interface BaseNode {
  id: string;
  type: NodeType;
  name?: string;
}

export interface FormSubmitNode extends BaseNode {
  type: 'form_submit';
  next: string;
}

export interface ApprovalNode extends BaseNode {
  type: 'approval';
  assignee: { role: string; scope: NodeScope };
  timeout?: { duration: string };
  next: string;
  rejected_next?: string;
}

export interface ConditionBranch {
  when: string; // 'default' or expression like 'duration_days >= 3'
  next: string;
  display_label?: string;
}

export interface ConditionNode extends BaseNode {
  type: 'condition';
  branches: ConditionBranch[];
}

export interface PublicityNode extends BaseNode {
  type: 'publicity';
  publicity: { duration: string };
  next: string;
  interrupt_on?: { event: string; next: string };
}

export interface NotificationNode extends BaseNode {
  type: 'notification';
  next: string;
}

export interface EndNode extends BaseNode {
  type: 'end';
  status: EndStatus;
}

export type FlowNode =
  | FormSubmitNode
  | ApprovalNode
  | ConditionNode
  | PublicityNode
  | NotificationNode
  | EndNode;

export interface FlowDsl {
  code: string;
  name: string;
  module?: string;
  start: string;
  nodes: FlowNode[];
  // Anything else (form, version, custom keys) survives a parse → edit →
  // serialize round trip via this bag.
  [key: string]: unknown;
}

/**
 * Parse a YAML string into a typed DSL. Throws if the YAML is malformed or
 * the top-level shape is not an object — caller should catch and surface
 * a friendly error.
 */
export function parseDsl(yamlText: string): FlowDsl {
  const raw = yaml.load(yamlText);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('YAML 顶层必须是 mapping');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) {
    throw new Error('YAML 缺少 nodes 数组');
  }
  return obj as unknown as FlowDsl;
}

/**
 * Serialize the DSL back to YAML. We keep the original key order by writing
 * out the well-known fields first (code/name/module/start/form) and letting
 * js-yaml dump the rest. flowLevel: -1 forces block style; lineWidth: -1
 * disables line wrapping so condition `when:` expressions stay readable.
 */
export function serializeDsl(dsl: FlowDsl): string {
  const ordered: Record<string, unknown> = {};
  const wellKnown = ['code', 'name', 'module', 'start', 'form'];
  for (const k of wellKnown) {
    if (k in dsl) ordered[k] = (dsl as Record<string, unknown>)[k];
  }
  // Include any other untouched top-level keys before nodes (so nodes is last,
  // matching V029 / V050 seed style).
  for (const k of Object.keys(dsl)) {
    if (wellKnown.includes(k) || k === 'nodes') continue;
    ordered[k] = (dsl as Record<string, unknown>)[k];
  }
  ordered.nodes = dsl.nodes;
  return yaml.dump(ordered, { lineWidth: -1, noRefs: true, sortKeys: false });
}

// ------------------- node helpers -------------------

const TYPE_LABEL: Record<NodeType, string> = {
  form_submit: '提交',
  approval: '审批',
  condition: '分支',
  publicity: '公示',
  notification: '通知',
  end: '终态',
};

export function nodeTypeLabel(t: NodeType): string {
  return TYPE_LABEL[t] ?? t;
}

const SCOPE_LABEL: Record<NodeScope, string> = {
  same_class: '同班',
  same_college: '同学院',
  global: '全校',
};
export function scopeLabel(s: NodeScope): string {
  return SCOPE_LABEL[s] ?? s;
}

export function makeDefaultNode(type: NodeType, existingIds: Set<string>): FlowNode {
  // Generate a non-colliding id like approval_2 / approval_3
  const base: string = type;
  let i = 1;
  let id: string = base;
  while (existingIds.has(id)) {
    i += 1;
    id = `${base}_${i}`;
  }
  switch (type) {
    case 'form_submit':
      return { id, type, name: '提交', next: '' };
    case 'approval':
      return {
        id,
        type,
        name: '审批',
        assignee: { role: 'counselor', scope: 'same_class' },
        timeout: { duration: '48h' },
        next: '',
        rejected_next: '',
      };
    case 'condition':
      return {
        id,
        type,
        name: '分支判断',
        branches: [
          { when: 'duration_days >= 3', next: '' },
          { when: 'default', next: '' },
        ],
      };
    case 'publicity':
      return {
        id,
        type,
        name: '公示期',
        publicity: { duration: '7d' },
        next: '',
      };
    case 'notification':
      return { id, type, name: '通知', next: '' };
    case 'end':
      return { id, type, name: '通过', status: 'completed' };
  }
}

/**
 * Validate that all `next` / `rejected_next` / `branches[].next` /
 * `interrupt_on.next` reference an existing node id. Returns array of
 * human-readable messages; empty array means OK.
 */
export function validateDsl(dsl: FlowDsl): string[] {
  const errors: string[] = [];
  const ids = new Set(dsl.nodes.map((n) => n.id));
  if (!ids.has(dsl.start)) {
    errors.push(`起始节点 "${dsl.start}" 不存在`);
  }
  const checkRef = (where: string, target: string | undefined) => {
    if (!target) return;
    if (!ids.has(target)) errors.push(`${where} 引用了不存在的节点 "${target}"`);
  };
  for (const n of dsl.nodes) {
    const where = `节点 ${n.name ?? n.id}`;
    switch (n.type) {
      case 'form_submit':
      case 'notification':
        if (!n.next) errors.push(`${where} 缺少下一节点`);
        else checkRef(`${where}.next`, n.next);
        break;
      case 'approval':
        if (!n.assignee?.role) errors.push(`${where} 缺少审批角色`);
        if (!n.next) errors.push(`${where} 缺少通过后的下一节点`);
        checkRef(`${where}.next`, n.next);
        checkRef(`${where}.rejected_next`, n.rejected_next);
        break;
      case 'condition':
        if (!n.branches?.length) errors.push(`${where} 至少需要一个分支`);
        n.branches?.forEach((b, i) => checkRef(`${where}.branches[${i}].next`, b.next));
        break;
      case 'publicity':
        if (!n.publicity?.duration) errors.push(`${where} 缺少公示期时长`);
        checkRef(`${where}.next`, n.next);
        if (n.interrupt_on) checkRef(`${where}.interrupt_on.next`, n.interrupt_on.next);
        break;
      case 'end':
        // no refs to check
        break;
    }
  }
  return errors;
}
