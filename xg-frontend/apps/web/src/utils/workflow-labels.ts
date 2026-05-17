import type { WorkflowDefinition } from '@xg1/shared';

/**
 * Maps internal biz_type strings to user-facing functional-module labels.
 * Used so admins see "请假" instead of "leave" / "leave_return" in 工作流定义
 * lists. Falls back to the raw module field, then to the biz_type itself.
 */
const FUNCTION_MODULE_LABELS: Record<string, string> = {
  leave: '请假',
  leave_return: '销假',
  workstudy_position: '勤工助学 · 岗位申请',
  workstudy_application: '勤工助学 · 学生申请',
  workstudy_salary: '勤工助学 · 薪资申请',
  workstudy_timesheet: '勤工助学 · 工时确认',
  test_smoke_global: '系统测试',
  rbac_test: '系统测试',
};

const RAW_MODULE_LABELS: Record<string, string> = {
  leave: '请销假',
  workstudy: '勤工助学',
};

export function functionModuleLabel(def: Pick<WorkflowDefinition, 'biz_type' | 'module'>): string {
  if (def.biz_type && FUNCTION_MODULE_LABELS[def.biz_type]) {
    return FUNCTION_MODULE_LABELS[def.biz_type];
  }
  if (def.module && RAW_MODULE_LABELS[def.module]) {
    return RAW_MODULE_LABELS[def.module];
  }
  return def.module ?? def.biz_type ?? '—';
}

/**
 * Real business-bound biz_types — the ones a school-admin should ever care
 * about. Tests / scaffolding (test_smoke_global / rbac_test) are filtered out
 * of the management UI. Add a new biz_type here when a new functional module
 * comes online (its handler must also call startWorkflowByBizType in business
 * code; without that this entry is just decoration).
 */
export const FUNCTIONAL_BIZ_TYPES = new Set([
  'leave',
  'leave_return',
  'workstudy_position',
  'workstudy_application',
  'workstudy_salary',
  'workstudy_timesheet',
]);

export function isFunctionalAndPublished(
  def: Pick<WorkflowDefinition, 'biz_type' | 'status'>,
): boolean {
  return def.status === 'published' && !!def.biz_type && FUNCTIONAL_BIZ_TYPES.has(def.biz_type);
}
