import { useMemo, useState } from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveTypeConfig, WorkflowDefinition } from '@xg1/shared';
import {
  listDefinitions,
  type DefinitionQueryParams,
} from '@/api/workflow';
import { getLeaveTypes } from '@/api/leave';
import { functionModuleLabel, isFunctionalAndPublished } from '@/utils/workflow-labels';
import FormFieldsEditor, { type EditorScope } from './FormFieldsEditor';
import styles from './index.module.css';

const PAGE_SIZE = 50;

function countFields(def: WorkflowDefinition): number {
  const json = def.config_json as Record<string, unknown> | undefined;
  const form = json?.form as Record<string, unknown> | undefined;
  const fields = form?.fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function countLeaveTypeFields(t: LeaveTypeConfig): number {
  const raw = (t as unknown as { extra_fields?: string | unknown[] | null }).extra_fields;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Each row in the unified table is one editable form. Workflows whose
 * biz_type='leave' fan out into "公共字段" + N leave_type rows because the
 * student-facing form is workflow-public-fields ⊕ type-specific-fields.
 * Other workflows (销假 / 勤工助学) collapse to a single row.
 */
type FormRow =
  | {
      kind: 'workflow_public';
      key: string;
      def: WorkflowDefinition;
      displayName: string;
      moduleLabel: string;
      fieldCount: number;
      hint: string;
    }
  | {
      kind: 'workflow';
      key: string;
      def: WorkflowDefinition;
      displayName: string;
      moduleLabel: string;
      fieldCount: number;
      hint: string;
    }
  | {
      kind: 'leave_type';
      key: string;
      leaveType: LeaveTypeConfig;
      parentDef: WorkflowDefinition;
      displayName: string;
      moduleLabel: string;
      fieldCount: number;
      hint: string;
    };

export default function FormManagement() {
  const [editingScope, setEditingScope] = useState<EditorScope | null>(null);

  const queryClient = useQueryClient();

  const queryParams: DefinitionQueryParams = { page: 1, size: 200 };

  const { data, isFetching } = useQuery({
    queryKey: ['workflowDefinitions', queryParams],
    queryFn: () => listDefinitions(queryParams),
  });

  const visibleWorkflowRows = useMemo(
    () => (data?.data ?? []).filter(isFunctionalAndPublished),
    [data?.data],
  );

  const { data: leaveTypes = [], isFetching: leaveTypesFetching } = useQuery({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 60 * 1000,
  });

  const flatRows = useMemo<FormRow[]>(() => {
    const rows: FormRow[] = [];
    for (const def of visibleWorkflowRows) {
      const moduleLabel = functionModuleLabel(def);
      if (def.biz_type === 'leave') {
        rows.push({
          kind: 'workflow_public',
          key: `wf-public:${def.id}`,
          def,
          displayName: `${def.name} · 公共字段`,
          moduleLabel,
          fieldCount: countFields(def),
          hint: '所有请假类型共用，改这里会影响每一种假别',
        });
        for (const lt of leaveTypes) {
          rows.push({
            kind: 'leave_type',
            key: `lt:${def.id}:${lt.code}`,
            leaveType: lt,
            parentDef: def,
            displayName: `${def.name} · ${lt.name}`,
            moduleLabel,
            fieldCount: countLeaveTypeFields(lt),
            hint: `仅在学生选择「${lt.name}」时附加显示`,
          });
        }
      } else {
        rows.push({
          kind: 'workflow',
          key: `wf:${def.id}`,
          def,
          displayName: def.name,
          moduleLabel,
          fieldCount: countFields(def),
          hint: '该流程的全部字段',
        });
      }
    }
    return rows;
  }, [visibleWorkflowRows, leaveTypes]);

  const columns: ColumnsType<FormRow> = [
    {
      title: '名称',
      key: 'name',
      width: 280,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.displayName}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{row.hint}</div>
        </div>
      ),
    },
    {
      title: '功能模块',
      key: 'functionModule',
      width: 180,
      render: (_, row) => (
        <Tag color="blue" style={{ margin: 0 }}>
          {row.moduleLabel}
        </Tag>
      ),
    },
    {
      title: '字段数',
      key: 'fieldCount',
      width: 80,
      render: (_, row) => row.fieldCount,
    },
    {
      title: '更新时间',
      key: 'updated_at',
      width: 160,
      render: (_, row) => {
        const v =
          row.kind === 'leave_type'
            ? (row.leaveType as { updated_at?: string | null }).updated_at
            : row.def.updated_at;
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
      width: 140,
      render: (_, row) => (
        <button
          className={styles.actionLink}
          onClick={() => {
            if (row.kind === 'leave_type') {
              setEditingScope({
                kind: 'leave_type',
                code: row.leaveType.code,
                name: row.leaveType.name,
              });
            } else {
              setEditingScope({ kind: 'workflow', definitionId: row.def.id });
            }
          }}
        >
          编辑字段
        </button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>系统管理 · 表单管理</h1>
      </div>
      <div className={styles.subtitle}>
        每行 = 学生看到的一份完整表单。请假按假别拆开（公假 / 事假 / 病假 / …），公共字段单独一行管理；销假和勤工助学没有"类型"概念，单行就是它的全部字段。
      </div>

      <div className={styles.tableCard}>
        <Table<FormRow>
          rowKey="key"
          columns={columns}
          dataSource={flatRows}
          loading={isFetching || leaveTypesFetching}
          pagination={
            flatRows.length > PAGE_SIZE
              ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
              : false
          }
          size="middle"
        />
      </div>

      <FormFieldsEditor
        scope={editingScope}
        onClose={() => setEditingScope(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['workflowDefinitions'] });
          queryClient.invalidateQueries({ queryKey: ['leaveTypes'] });
          setEditingScope(null);
        }}
      />
    </div>
  );
}
