import dayjs from 'dayjs';
import { getLeaveDetail } from '@/api/leave';
import { getPendingTasks, batchApproveTasks } from '@/api/workflow';
import type { BatchActionSpec, BatchItem, BatchResult } from '@/stores/batch-action.store';
import type { PinnedRef } from '@/stores/ai-action.store';

interface PreparedSpec {
  spec: BatchActionSpec;
}

interface BuildSpecContext {
  /** Current user id — needed to pull the user's pending-task inbox. */
  assigneeId: string | number | undefined;
  /** User-provided title / tone overrides from the AI action payload. */
  title?: string;
  /** Action mode: approve (default) or reject. */
  mode?: 'approve' | 'reject';
}

interface LeavePrepResult {
  items: BatchItem[];
  /** leaveId → resolved taskId (missing if no active task was found). */
  leaveToTask: Map<string, string>;
}

async function prepareLeaveItems(
  refs: PinnedRef[],
  assigneeId: string | number | undefined,
): Promise<LeavePrepResult> {
  const leaveIds = Array.from(
    new Set(refs.filter((r) => r.type === 'leave' && r.id).map((r) => String(r.id))),
  );
  if (leaveIds.length === 0) return { items: [], leaveToTask: new Map() };

  // Fetch leaves + counselor's pending-task inbox in parallel. We cross-reference
  // on workflow_instance_id — that's how a leave maps to its active approval task.
  const [leaves, pending] = await Promise.all([
    Promise.all(
      leaveIds.map((id) =>
        getLeaveDetail(id).catch((err) => {
          // Don't let one bad leaveId sink the whole batch — represent it as a
          // disabled row the user can see.
          return {
            id,
            student_name: `请假 ${id}`,
            leave_type_name: '—',
            start_time: '',
            end_time: '',
            duration_days: 0,
            reason: '',
            workflow_instance_id: null,
            __error: err instanceof Error ? err.message : '加载失败',
          } as never;
        }),
      ),
    ),
    assigneeId
      ? getPendingTasks({ page: 1, size: 200, assigneeId: String(assigneeId) })
      : Promise.resolve({ data: [], total: 0 } as never),
  ]);

  const taskByWf = new Map<string, string>();
  for (const t of pending.data ?? []) {
    if (t.workflow_instance_id && t.status === 'pending') {
      taskByWf.set(String(t.workflow_instance_id), String(t.id));
    }
  }

  const leaveToTask = new Map<string, string>();
  const items: BatchItem[] = leaves.map((l) => {
    const leaveErr = (l as unknown as { __error?: string }).__error;
    const wfId = l.workflow_instance_id ? String(l.workflow_instance_id) : null;
    const taskId = wfId ? taskByWf.get(wfId) : undefined;
    if (taskId) leaveToTask.set(String(l.id), taskId);

    const dateRange =
      l.start_time && l.end_time
        ? `${dayjs(l.start_time).format('MM-DD')} ~ ${dayjs(l.end_time).format('MM-DD')} · ${l.duration_days}天`
        : '—';

    let disabledReason: string | undefined;
    if (leaveErr) disabledReason = `加载失败：${leaveErr}`;
    else if (!wfId) disabledReason = '此请假未进入审批流程';
    else if (!taskId) disabledReason = '没有分配给你的待审批任务（可能已被他人审批）';

    return {
      id: taskId ?? `leave:${l.id}`,
      title: `${l.student_name} · ${l.leave_type_name}`,
      subtitle: dateRange,
      detail: l.reason || undefined,
      disabled: !taskId,
      disabledReason,
      meta: { leaveId: l.id, taskId, studentId: l.student_id },
    };
  });

  return { items, leaveToTask };
}

export async function buildLeaveApprovalSpec(
  refs: PinnedRef[],
  ctx: BuildSpecContext,
): Promise<PreparedSpec> {
  const mode = ctx.mode ?? 'approve';
  const { items } = await prepareLeaveItems(refs, ctx.assigneeId);
  const executable = items.filter((i) => !i.disabled);

  const spec: BatchActionSpec = {
    title: ctx.title ?? (mode === 'approve' ? '批量批准请假' : '批量驳回请假'),
    description:
      executable.length > 0
        ? `勾选需要${mode === 'approve' ? '批准' : '驳回'}的请假，填写批注后一键执行；每条独立事务，失败不影响其他条。`
        : '没有可执行的请假任务。',
    confirmLabel: mode === 'approve' ? '批准所选' : '驳回所选',
    confirmTone: mode === 'approve' ? 'primary' : 'danger',
    commentEnabled: true,
    commentPlaceholder:
      mode === 'approve'
        ? '批注（选填，例如：材料齐全，同意）'
        : '驳回理由（建议填写，学生会看到）',
    items,
    executor: async (selectedIds, comment): Promise<BatchResult> => {
      const taskIds = selectedIds; // item.id IS the taskId for enabled rows
      if (taskIds.length === 0) {
        return { total: 0, success: 0, fail: 0, failures: [] };
      }
      const res = await batchApproveTasks(taskIds, mode, comment.trim() || undefined);
      const rawFailures = extractFailures(res);
      return {
        total: taskIds.length,
        success: Math.max(0, taskIds.length - rawFailures.length),
        fail: rawFailures.length,
        failures: rawFailures.map((f) => ({
          itemId: f.taskId,
          reason: f.reason || '未知错误',
        })),
      };
    },
  };
  return { spec };
}

/**
 * Normalize backend BatchApproveResult into `{ taskId, reason }` failure list.
 * The server returns failures as strings like "taskId=123: reason here".
 */
function extractFailures(
  res: unknown,
): Array<{ taskId: string; reason: string }> {
  if (!res || typeof res !== 'object') return [];
  const r = res as { failures?: unknown; failCount?: number };
  if (!Array.isArray(r.failures)) return [];
  return r.failures
    .filter((f): f is string => typeof f === 'string')
    .map((line) => {
      const m = /^taskId=(\d+):\s*(.*)$/.exec(line);
      return m
        ? { taskId: m[1], reason: m[2] || '未知错误' }
        : { taskId: '', reason: line };
    })
    .filter((f) => f.taskId);
}
