import { useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  Space,
  Skeleton,
  message,
  Tag,
  Tooltip,
  Alert,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkflowDefinition } from '@xg1/shared';
import {
  getDefinition,
  getFormSchema,
  publishDefinition,
  updateFormFields,
  type FormFieldPayload,
  type FormFieldSchema,
  type FormFieldType,
  type FormFieldWidget,
} from '@/api/workflow';
import { getLeaveTypeFields, updateLeaveTypeFields } from '@/api/leave';
import { describeApiError } from '@/utils/api-error';
import styles from './index.module.css';

export type EditorScope =
  | { kind: 'workflow'; definitionId: string }
  | { kind: 'leave_type'; code: string; name: string };

interface UiType {
  value: string;
  label: string;
  type: FormFieldType;
  widget: FormFieldWidget | '';
  needsOptions: boolean;
  isFile?: boolean;
  /** Signature is a file under the hood (PNG image_id) but rendered with a Canvas. */
  isSignature?: boolean;
}

const UI_TYPES: UiType[] = [
  { value: 'text', label: '单行文本', type: 'string', widget: '', needsOptions: false },
  { value: 'textarea', label: '多行文本', type: 'string', widget: 'textarea', needsOptions: false },
  { value: 'number', label: '数字', type: 'number', widget: '', needsOptions: false },
  { value: 'boolean', label: '是/否', type: 'boolean', widget: '', needsOptions: false },
  { value: 'date', label: '日期', type: 'date', widget: '', needsOptions: false },
  { value: 'select', label: '单选下拉', type: 'string', widget: 'select', needsOptions: true },
  { value: 'radio', label: '单选按钮', type: 'string', widget: 'radio', needsOptions: true },
  { value: 'file', label: '文件上传', type: 'file', widget: '', needsOptions: false, isFile: true },
  // 「手写签名」字段已下线 — 学生端真实需求是上传纸质签名照片,统一走「文件上传」即可。
  // 底层 SignaturePad 组件 + DynamicFormFields 的 signature 分支保留,旧数据仍能渲染,
  // 但新建表单入口不再暴露这种字段类型。
];

function uiTypeOf(type?: string, widget?: string | null, hasOptions?: boolean): string {
  if (type === 'file') {
    if (widget === 'signature') return 'signature';
    return 'file';
  }
  if (hasOptions) {
    if (widget === 'radio') return 'radio';
    return 'select';
  }
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'date') return 'date';
  if (widget === 'textarea') return 'textarea';
  return 'text';
}

interface FieldEdit {
  uid: string;
  existed: boolean;
  uiType: string;
  name: string;
  label: string;
  required: boolean;
  deprecated: boolean;
  placeholder: string;
  pattern: string;
  optionsText: string;
  min: number | null;
  max: number | null;
  minLength: number | null;
  maxLength: number | null;
  fileMaxCount: number | null;
  fileAccept: string;
  fileMaxSizeKb: number | null;
  expanded: boolean;
}

function makeUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fromServer(raw: Record<string, unknown>): FieldEdit {
  const opts = raw.options;
  const optionsText = Array.isArray(opts) ? opts.map((o) => String(o)).join('\n') : '';
  return {
    uid: makeUid(),
    existed: true,
    uiType: uiTypeOf(raw.type as string, raw.widget as string, Array.isArray(opts) && opts.length > 0),
    name: String(raw.name ?? ''),
    label: String(raw.label ?? ''),
    required: Boolean(raw.required),
    deprecated: Boolean(raw.deprecated),
    placeholder: String(raw.placeholder ?? ''),
    pattern: String(raw.pattern ?? ''),
    optionsText,
    min: typeof raw.min === 'number' ? raw.min : null,
    max: typeof raw.max === 'number' ? raw.max : null,
    minLength: typeof raw.minLength === 'number' ? raw.minLength : null,
    maxLength: typeof raw.maxLength === 'number' ? raw.maxLength : null,
    fileMaxCount: typeof raw.fileMaxCount === 'number' ? raw.fileMaxCount : null,
    fileAccept: String(raw.fileAccept ?? ''),
    fileMaxSizeKb: typeof raw.fileMaxSizeKb === 'number' ? raw.fileMaxSizeKb : null,
    expanded: false,
  };
}

function extractFieldsFromDef(def: WorkflowDefinition | null): FieldEdit[] {
  if (!def) return [];
  const json = def.config_json as Record<string, unknown> | undefined;
  const form = json?.form as Record<string, unknown> | undefined;
  const raw = form?.fields;
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(fromServer);
}

function emptyField(): FieldEdit {
  return {
    uid: makeUid(),
    existed: false,
    uiType: 'text',
    name: '',
    label: '',
    required: false,
    deprecated: false,
    placeholder: '',
    pattern: '',
    optionsText: '',
    min: null,
    max: null,
    minLength: null,
    maxLength: null,
    fileMaxCount: null,
    fileAccept: '',
    fileMaxSizeKb: null,
    expanded: true,
  };
}

function toPayload(f: FieldEdit): FormFieldPayload {
  const ui = UI_TYPES.find((u) => u.value === f.uiType) ?? UI_TYPES[0];
  const options = ui.needsOptions
    ? f.optionsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;
  return {
    name: f.name.trim(),
    label: f.label.trim(),
    type: ui.type,
    widget: ui.widget === '' ? null : (ui.widget as FormFieldWidget),
    required: f.required || undefined,
    deprecated: f.deprecated || undefined,
    placeholder: f.placeholder.trim() || null,
    pattern: f.pattern.trim() || null,
    options: options && options.length > 0 ? options : null,
    min: ui.type === 'number' ? f.min : null,
    max: ui.type === 'number' ? f.max : null,
    minLength: ui.type === 'string' ? f.minLength : null,
    maxLength: ui.type === 'string' ? f.maxLength : null,
    // Signature: force single PNG, ignore user-supplied file_* knobs.
    fileMaxCount: ui.isSignature ? 1 : ui.isFile ? (f.fileMaxCount ?? 1) : null,
    fileAccept: ui.isSignature ? 'image/png' : ui.isFile ? (f.fileAccept.trim() || null) : null,
    fileMaxSizeKb: ui.isSignature ? null : ui.isFile ? f.fileMaxSizeKb : null,
  };
}

function validateAll(fields: FieldEdit[]): string | null {
  if (fields.length === 0) return '至少要有一个字段';
  const seen = new Set<string>();
  const namePattern = /^[a-z][a-z0-9_]{0,63}$/;
  for (const f of fields) {
    if (!namePattern.test(f.name)) {
      return `字段标识必须是英文 snake_case：${f.name || '(空)'}`;
    }
    if (seen.has(f.name)) {
      return `字段标识重复：${f.name}`;
    }
    seen.add(f.name);
    if (!f.label.trim()) {
      return `字段 ${f.name} 缺少显示名（标签）`;
    }
    const ui = UI_TYPES.find((u) => u.value === f.uiType);
    if (ui?.needsOptions) {
      const count = f.optionsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0).length;
      if (count === 0) {
        return `字段 ${f.name} 是${ui.label}，必须至少 1 个选项`;
      }
    }
  }
  return null;
}

interface Props {
  scope: EditorScope | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function FormFieldsEditor({ scope, onClose, onSaved }: Props) {
  const open = scope !== null;
  const isWorkflow = scope?.kind === 'workflow';
  const isLeaveType = scope?.kind === 'leave_type';

  const wfQuery = useQuery({
    queryKey: ['workflowDefinition', isWorkflow ? scope.definitionId : null],
    queryFn: () => getDefinition((scope as { definitionId: string }).definitionId),
    enabled: isWorkflow,
  });

  const ltQuery = useQuery({
    queryKey: ['leaveTypeFields', isLeaveType ? scope.code : null],
    queryFn: () => getLeaveTypeFields((scope as { code: string }).code),
    enabled: isLeaveType,
  });

  // Public-fields preview for leave_type scope: pulled from the published
  // leave workflow's form schema. Read-only — admins must go to the
  // 「请假审批 · 公共字段」row to actually edit these.
  const publicFieldsQuery = useQuery({
    queryKey: ['formSchema', 'leave', null],
    queryFn: () => getFormSchema({ bizType: 'leave' }),
    enabled: isLeaveType,
    staleTime: 60 * 1000,
  });

  const isLoading = isWorkflow ? wfQuery.isLoading : ltQuery.isLoading;
  const def = isWorkflow ? wfQuery.data ?? null : null;
  const ltFields = isLeaveType ? ltQuery.data ?? null : null;
  const ready = isWorkflow ? def !== null : isLeaveType ? ltFields !== null : false;
  const publicFields = isLeaveType ? publicFieldsQuery.data?.fields ?? [] : [];

  const initialFields = useMemo<FieldEdit[]>(() => {
    if (isWorkflow) return extractFieldsFromDef(def);
    if (isLeaveType && ltFields) {
      return (ltFields as unknown as Record<string, unknown>[]).map(fromServer);
    }
    return [];
  }, [isWorkflow, isLeaveType, def, ltFields]);

  // Re-key inner so its useState initializer re-runs when fresh data lands.
  const innerKey =
    isWorkflow && def
      ? `wf:${def.id}:${def.version}`
      : isLeaveType
      ? `lt:${(scope as { code: string }).code}:${ltFields ? 'loaded' : 'pending'}`
      : 'empty';

  return (
    <FormFieldsDrawer
      key={innerKey}
      open={open}
      scope={scope}
      isLoading={isLoading}
      ready={ready}
      def={def}
      initialFields={initialFields}
      publicFields={publicFields}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

interface DrawerInnerProps {
  open: boolean;
  scope: EditorScope | null;
  isLoading: boolean;
  ready: boolean;
  def: WorkflowDefinition | null;
  initialFields: FieldEdit[];
  publicFields: FormFieldSchema[];
  onClose: () => void;
  onSaved: () => void;
}

function FormFieldsDrawer({
  open,
  scope,
  isLoading,
  ready,
  def,
  initialFields,
  publicFields,
  onClose,
  onSaved,
}: DrawerInnerProps) {
  const queryClient = useQueryClient();
  const isLeaveType = scope?.kind === 'leave_type';

  // Inner state seeded from initialFields. The outer re-keys this component
  // when the loaded data changes, so the initializer always sees fresh data.
  const [fields, setFields] = useState<FieldEdit[]>(() => initialFields);
  const [adding, setAdding] = useState<FieldEdit | null>(null);
  const [dirty, setDirty] = useState(false);

  const updateField = (uid: string, patch: Partial<FieldEdit>) => {
    setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
    setDirty(true);
  };

  const moveField = (uid: string, dir: -1 | 1) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.uid === uid);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
    setDirty(true);
  };

  const removeField = (uid: string) => {
    setFields((prev) => prev.filter((f) => f.uid !== uid));
    setDirty(true);
  };

  const toggleDeprecated = (uid: string) => {
    setFields((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, deprecated: !f.deprecated } : f)),
    );
    setDirty(true);
  };

  const startAdding = () => {
    setAdding(emptyField());
  };

  const commitAdding = () => {
    if (!adding) return;
    if (!adding.name.trim() || !adding.label.trim()) {
      message.warning('请至少填写「标签」和「标识」');
      return;
    }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(adding.name)) {
      message.error('标识必须是英文 snake_case');
      return;
    }
    if (fields.some((f) => f.name === adding.name)) {
      message.error(`标识已存在：${adding.name}`);
      return;
    }
    setFields((prev) => [...prev, { ...adding, expanded: false }]);
    setAdding(null);
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const err = validateAll(fields);
      if (err) {
        throw new Error(err);
      }
      const payload = fields.map(toPayload);
      if (scope?.kind === 'workflow') {
        // Save creates a v+1 draft; immediately publish so the list (which
        // only shows published rows) reflects the change. RED-level breaking
        // changes are rejected by /publish and surfaced as a clear error.
        const draft = await updateFormFields(scope.definitionId, payload);
        return await publishDefinition(draft.id);
      }
      if (scope?.kind === 'leave_type') {
        await updateLeaveTypeFields(scope.code, payload);
        return null;
      }
      throw new Error('未知的编辑范围');
    },
    onSuccess: (resp) => {
      if (scope?.kind === 'workflow' && resp) {
        const next = resp as WorkflowDefinition;
        message.success(`已保存并发布 — ${next.name} v${next.version} 已生效。`);
        queryClient.invalidateQueries({ queryKey: ['workflowDefinitions'] });
      } else if (scope?.kind === 'leave_type') {
        message.success(`${scope.name} 表单已直接生效（无需发布）。`);
        queryClient.invalidateQueries({ queryKey: ['leaveTypes'] });
        queryClient.invalidateQueries({ queryKey: ['leaveTypeFields', scope.code] });
      }
      onSaved();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });

  const title = useMemo(() => {
    if (scope?.kind === 'leave_type') {
      return `类型表单 — ${scope.name}`;
    }
    if (!def) return '表单字段';
    return `流程表单 — ${def.name}`;
  }, [scope, def]);

  const visibleFieldCount = fields.filter((f) => !f.deprecated).length;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={() => {
        if (dirty && !window.confirm('有未保存的更改，确定关闭？')) return;
        onClose();
      }}
      width={780}
      destroyOnHidden
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={saveMutation.isPending}>
            关闭
          </Button>
          <Button
            type="primary"
            disabled={!dirty}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {isLeaveType ? '保存（直接生效）' : '保存并发布'}
          </Button>
        </Space>
      }
    >
      {isLoading || !ready ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div className={styles.editorBody}>
          {isLeaveType && scope?.kind === 'leave_type' ? (
            <>
              <Alert
                type="warning"
                showIcon
                message={
                  <span>
                    你正在编辑 <strong>{scope.name}</strong> 的特有字段，<strong>不影响其他假别</strong>。
                  </span>
                }
                description="类型表单没有草稿/版本，保存即生效。在途请假申请按提交时的 form_data 走，不受影响。"
              />
              {publicFields.length > 0 && (
                <PublicFieldsReadonly fields={publicFields} typeName={scope.name} />
              )}
            </>
          ) : def ? (
            <div className={styles.editorHint}>
              保存即发布为 <strong>{def.name} v{def.version + 1}</strong>，旧版本自动停用。
              已在跑的实例靠快照锁版本，不受影响。
              <br />
              已发布字段建议「停用」而不是删除——删除字段会在发布时被 RED 阻断（破坏历史数据）。
            </div>
          ) : null}

          {isLeaveType && scope?.kind === 'leave_type' && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--fg-2)',
                marginTop: 4,
              }}
            >
              {scope.name} 特有字段（可编辑）
            </div>
          )}

          {fields.length === 0 ? (
            <div className={styles.emptyState}>
              {isLeaveType
                ? '当前假别还没有特有字段。点击下方「新增字段」开始添加。'
                : '这个流程当前没有表单字段。点击下方「新增字段」开始添加。'}
            </div>
          ) : (
            <div className={styles.fieldList}>
              <div className={styles.metaLine}>
                共 {fields.length} 个字段（生效 {visibleFieldCount} · 停用{' '}
                {fields.length - visibleFieldCount}）
              </div>
              {fields.map((f, idx) => (
                <FieldCard
                  key={f.uid}
                  field={f}
                  index={idx}
                  total={fields.length}
                  onPatch={(patch) => updateField(f.uid, patch)}
                  onMove={(dir) => moveField(f.uid, dir)}
                  onToggleDeprecated={() => toggleDeprecated(f.uid)}
                  onRemove={() => removeField(f.uid)}
                />
              ))}
            </div>
          )}

          {adding ? (
            <div className={styles.addBlock}>
              <div className={styles.addBlockTitle}>新增字段</div>
              <FieldEditor
                field={adding}
                allowEditName
                onPatch={(patch) => setAdding({ ...adding, ...patch })}
              />
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" onClick={commitAdding}>
                  追加
                </Button>
                <Button onClick={() => setAdding(null)}>取消</Button>
              </Space>
            </div>
          ) : (
            <Button
              icon={<PlusOutlined />}
              type="dashed"
              block
              onClick={startAdding}
            >
              新增字段
            </Button>
          )}

          {dirty && (
            <Alert
              type="info"
              showIcon
              message="有未保存的更改"
              description={
                isLeaveType
                  ? '点击右下角「保存（直接生效）」让修改对学生立即可见。'
                  : `点击右下角「保存并发布」会更新到 v${(def?.version ?? 0) + 1} 并立即生效。`
              }
            />
          )}
        </div>
      )}
    </Drawer>
  );
}

function PublicFieldsReadonly({
  fields,
  typeName,
}: {
  fields: FormFieldSchema[];
  typeName: string;
}) {
  const visible = fields.filter((f) => !f.deprecated);
  if (visible.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 6 }}>
        公共字段（所有请假类型共用 · 只读）
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 8 }}>
        这些字段是所有请假类型都填的；改它们会影响所有假别（不仅仅是 {typeName}）。
        如需修改请到「请假审批 · 公共字段」行编辑。
      </div>
      <div className={styles.fieldList}>
        {visible.map((f) => (
          <PublicFieldCard key={f.name} field={f} />
        ))}
      </div>
    </div>
  );
}

function PublicFieldCard({ field }: { field: FormFieldSchema }) {
  const ui = describeFieldType(field);
  return (
    <div
      className={styles.fieldCard}
      style={{
        opacity: 0.85,
        background: 'var(--bg-3)',
        borderStyle: 'dashed',
      }}
    >
      <div className={styles.fieldCardHead}>
        <span className={styles.fieldName}>{field.label || '(未命名)'}</span>
        <span className={styles.fieldKey}>({field.name || '?'})</span>
        <span className={styles.fieldType}>{ui}</span>
        {field.required && <Tag color="red" style={{ margin: 0 }}>必填</Tag>}
      </div>
      {(field.options && field.options.length > 0) || field.placeholder || field.pattern ? (
        <div className={styles.fieldMeta}>
          {field.options && field.options.length > 0 && (
            <div>
              {field.options.slice(0, 6).map((o) => (
                <span key={o} className={styles.fieldChip}>
                  {o}
                </span>
              ))}
              {field.options.length > 6 && (
                <span className={styles.fieldChip}>+{field.options.length - 6}</span>
              )}
            </div>
          )}
          {field.placeholder && <div>占位符 "{field.placeholder}"</div>}
          {field.pattern && <div>正则 {field.pattern}</div>}
        </div>
      ) : null}
    </div>
  );
}

function describeFieldType(f: FormFieldSchema): string {
  const hasOptions = f.options && f.options.length > 0;
  if (f.type === 'file') return '文件';
  if (f.type === 'number') return '数字';
  if (f.type === 'boolean') return '是/否';
  if (f.type === 'date') return '日期';
  if (hasOptions) return f.widget === 'radio' ? '单选按钮' : '单选下拉';
  return f.widget === 'textarea' ? '多行文本' : '单行文本';
}

interface FieldCardProps {
  field: FieldEdit;
  index: number;
  total: number;
  onPatch: (patch: Partial<FieldEdit>) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleDeprecated: () => void;
  onRemove: () => void;
}

function FieldCard({
  field,
  index,
  total,
  onPatch,
  onMove,
  onToggleDeprecated,
  onRemove,
}: FieldCardProps) {
  const ui = UI_TYPES.find((u) => u.value === field.uiType) ?? UI_TYPES[0];
  return (
    <div
      className={`${styles.fieldCard} ${field.deprecated ? styles.fieldCardDeprecated : ''}`}
    >
      <div className={styles.fieldCardHead}>
        <span className={styles.fieldName}>{field.label || '(未命名)'}</span>
        <span className={styles.fieldKey}>({field.name || '?'})</span>
        <span className={styles.fieldType}>{ui.label}</span>
        {field.required && <Tag color="red" style={{ margin: 0 }}>必填</Tag>}
        {field.deprecated && <Tag color="default" style={{ margin: 0 }}>已停用</Tag>}
        {!field.existed && <Tag color="green" style={{ margin: 0 }}>新增</Tag>}
        <div className={styles.fieldActions}>
          <Tooltip title="上移">
            <button onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowUpOutlined />
            </button>
          </Tooltip>
          <Tooltip title="下移">
            <button onClick={() => onMove(1)} disabled={index === total - 1}>
              <ArrowDownOutlined />
            </button>
          </Tooltip>
          <Tooltip title={field.expanded ? '收起' : '编辑'}>
            <button onClick={() => onPatch({ expanded: !field.expanded })}>
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title={field.deprecated ? '恢复启用' : '停用（保留兼容）'}>
            <button onClick={onToggleDeprecated}>
              {field.deprecated ? <UndoOutlined /> : <StopOutlined />}
            </button>
          </Tooltip>
          <Tooltip
            title={
              field.existed
                ? '已发布字段不能直接删除，请先「停用」。物理删除发布时会被 RED 阻断。'
                : '删除'
            }
          >
            <button
              onClick={onRemove}
              disabled={field.existed}
              style={{ color: field.existed ? undefined : 'var(--err)' }}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {!field.expanded && <FieldSummaryLine field={field} ui={ui} />}

      {field.expanded && (
        <FieldEditor field={field} allowEditName={!field.existed} onPatch={onPatch} />
      )}
    </div>
  );
}

function FieldSummaryLine({ field, ui }: { field: FieldEdit; ui: UiType }) {
  const opts = ui.needsOptions
    ? field.optionsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s)
    : [];
  const bits: string[] = [];
  if (field.placeholder) bits.push(`占位符 "${field.placeholder}"`);
  if (field.pattern) bits.push(`正则 ${field.pattern}`);
  if (ui.type === 'string' && (field.minLength != null || field.maxLength != null)) {
    bits.push(
      `长度 ${field.minLength ?? '*'}-${field.maxLength ?? '*'}`,
    );
  }
  if (ui.type === 'number' && (field.min != null || field.max != null)) {
    bits.push(`取值 ${field.min ?? '*'}-${field.max ?? '*'}`);
  }
  return (
    <div className={styles.fieldMeta}>
      {opts.length > 0 && (
        <div>
          {opts.slice(0, 6).map((o) => (
            <span key={o} className={styles.fieldChip}>
              {o}
            </span>
          ))}
          {opts.length > 6 && <span className={styles.fieldChip}>+{opts.length - 6}</span>}
        </div>
      )}
      {bits.length > 0 && <div>{bits.join('  ·  ')}</div>}
    </div>
  );
}

interface FieldEditorProps {
  field: FieldEdit;
  allowEditName: boolean;
  onPatch: (patch: Partial<FieldEdit>) => void;
}

function FieldEditor({ field, allowEditName, onPatch }: FieldEditorProps) {
  const ui = UI_TYPES.find((u) => u.value === field.uiType) ?? UI_TYPES[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FormRow label="类型">
        <Select
          value={field.uiType}
          onChange={(v) => onPatch({ uiType: v })}
          options={UI_TYPES.map((u) => ({ label: u.label, value: u.value }))}
          style={{ width: 200 }}
        />
      </FormRow>
      <FormRow label="标签（显示名）">
        <Input
          value={field.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="例如：紧急联系人电话"
          maxLength={100}
        />
      </FormRow>
      <FormRow label="标识（snake_case）">
        <Input
          value={field.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="例如：emergency_contact"
          maxLength={64}
          disabled={!allowEditName}
        />
      </FormRow>
      <FormRow label="必填">
        <Switch checked={field.required} onChange={(v) => onPatch({ required: v })} />
      </FormRow>

      {ui.needsOptions && (
        <FormRow label="选项（每行一个）">
          <Input.TextArea
            value={field.optionsText}
            onChange={(e) => onPatch({ optionsText: e.target.value })}
            placeholder={'事假\n病假\n年假'}
            rows={4}
          />
        </FormRow>
      )}

      <FormRow label="占位符">
        <Input
          value={field.placeholder}
          onChange={(e) => onPatch({ placeholder: e.target.value })}
          placeholder="（可选）输入框灰色提示文字"
        />
      </FormRow>

      {ui.type === 'string' && !ui.needsOptions && (
        <>
          <FormRow label="正则校验">
            <Input
              value={field.pattern}
              onChange={(e) => onPatch({ pattern: e.target.value })}
              placeholder='例如：^1[3-9]\d{9}$ （手机号）'
            />
          </FormRow>
          <FormRow label="字符长度">
            <Space>
              <InputNumber
                value={field.minLength ?? null}
                onChange={(v) => onPatch({ minLength: v == null ? null : Number(v) })}
                min={0}
                placeholder="最少"
                style={{ width: 110 }}
              />
              <span style={{ color: 'var(--fg-3)' }}>—</span>
              <InputNumber
                value={field.maxLength ?? null}
                onChange={(v) => onPatch({ maxLength: v == null ? null : Number(v) })}
                min={0}
                placeholder="最多"
                style={{ width: 110 }}
              />
            </Space>
          </FormRow>
        </>
      )}

      {ui.type === 'number' && (
        <FormRow label="取值范围">
          <Space>
            <InputNumber
              value={field.min ?? null}
              onChange={(v) => onPatch({ min: v == null ? null : Number(v) })}
              placeholder="最小"
              style={{ width: 130 }}
            />
            <span style={{ color: 'var(--fg-3)' }}>—</span>
            <InputNumber
              value={field.max ?? null}
              onChange={(v) => onPatch({ max: v == null ? null : Number(v) })}
              placeholder="最大"
              style={{ width: 130 }}
            />
          </Space>
        </FormRow>
      )}

      {ui.isFile && !ui.isSignature && (
        <>
          <FormRow label="最多张数">
            <InputNumber
              value={field.fileMaxCount ?? 1}
              onChange={(v) => onPatch({ fileMaxCount: v == null ? null : Number(v) })}
              min={1}
              max={20}
              style={{ width: 130 }}
            />
          </FormRow>
          <FormRow label="允许类型">
            <Input
              value={field.fileAccept}
              onChange={(e) => onPatch({ fileAccept: e.target.value })}
              placeholder="例如：image/* 或 .pdf,.doc,.xlsx（留空不限）"
            />
          </FormRow>
          <FormRow label="单文件大小">
            <Space>
              <InputNumber
                value={field.fileMaxSizeKb ?? null}
                onChange={(v) => onPatch({ fileMaxSizeKb: v == null ? null : Number(v) })}
                min={1}
                placeholder="（可选）"
                style={{ width: 160 }}
              />
              <span style={{ color: 'var(--fg-3)' }}>KB</span>
            </Space>
          </FormRow>
        </>
      )}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div
        style={{
          width: 120,
          flexShrink: 0,
          fontSize: 12.5,
          color: 'var(--fg-3)',
          paddingTop: 6,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
