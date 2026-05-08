import type { QueryClient } from '@tanstack/react-query';
import type { LeaveRequest, PendingTaskEnriched } from '@xg1/shared';
import { getLeaveDetail } from '@/api/leave';
import { getTaskAiRecommendation, type TaskAiRecommendation } from '@/api/workflow';

// The "vague reason" set mirrors what the sidecar prompt flags as 敷衍词.
// Kept as exact-match to avoid false positives on legitimate substrings
// like "感冒发烧等" — we only veto when the reason IS the placeholder.
const VAGUE_REASONS = new Set(['有事', '有点事', '其他', '等', '请假']);

// Destination keywords that signal cross-border travel. Substring match —
// "出境旅游" / "去境外" / "出国办事" all hit.
const RISKY_DESTINATION_KEYWORDS = ['出境', '境外', '出国', '国外', '海外'];

// Tooltip in InsightCard promises "本次请假 ≤ 3 天" but the rule engine puts
// 3 < d < 4 days into low. Enforce the user-facing promise here.
const MAX_BATCH_APPROVE_DAYS = 3;

export interface DroppedTask {
  taskId: string;
  studentName: string;
  reason: string;
}

export interface LowRiskFilterResult {
  passedIds: string[];
  dropped: DroppedTask[];
}

/**
 * Filter rule-engine-judged low-risk tasks before one-click batch approve.
 *
 * Two layers, ordered cheap → expensive so a deterministic catch skips the
 * AI call entirely:
 *
 *   1) form_data + duration hard rules — covers the rule engine's blind
 *      spots (敷衍事由, 出境目的地, 3.5-day requests that slipped into low).
 *   2) AI second opinion via the existing /ai-recommendation endpoint —
 *      the same prompt the per-row AI box uses; we treat caution/reject as
 *      a veto for batch approve.
 *
 * Both layers are best-effort: per-task fetch errors mean that task passes,
 * so a flaky sidecar or stale leave id doesn't break the batch button.
 */
export async function filterLowRiskBatch(
  queryClient: QueryClient,
  tasks: PendingTaskEnriched[],
): Promise<LowRiskFilterResult> {
  const passedIds: string[] = [];
  const dropped: DroppedTask[] = [];

  await Promise.all(
    tasks.map(async (task) => {
      const studentName = task.initiator_name ?? '未知';
      const dropReason = await evaluateTask(queryClient, task);
      if (dropReason) {
        dropped.push({ taskId: task.id, studentName, reason: dropReason });
      } else {
        passedIds.push(task.id);
      }
    }),
  );

  return { passedIds, dropped };
}

async function evaluateTask(
  queryClient: QueryClient,
  task: PendingTaskEnriched,
): Promise<string | null> {
  const formCheck = await checkFormAndDuration(queryClient, task);
  if (formCheck) return formCheck;
  return checkAi(queryClient, task);
}

async function checkFormAndDuration(
  queryClient: QueryClient,
  task: PendingTaskEnriched,
): Promise<string | null> {
  const durationDays = task.leave_duration_days != null ? Number(task.leave_duration_days) : null;
  if (durationDays != null && Number.isFinite(durationDays) && durationDays > MAX_BATCH_APPROVE_DAYS) {
    return `本次请假 ${durationDays} 天，超过一键批阈值（${MAX_BATCH_APPROVE_DAYS} 天）`;
  }

  const reason = (task.leave_reason ?? '').trim();
  if (reason.length === 0) {
    return '请假事由为空';
  }
  if (VAGUE_REASONS.has(reason)) {
    return `请假事由过于模糊（"${reason}"）`;
  }

  if (!task.biz_id) return null;
  let leave: LeaveRequest;
  try {
    leave = await queryClient.fetchQuery({
      queryKey: ['leaveDetail', task.biz_id],
      queryFn: () => getLeaveDetail(task.biz_id!),
      staleTime: 60 * 1000,
    });
  } catch {
    return null;
  }
  const destination = String(leave.form_data?.destination ?? '').trim();
  if (destination && RISKY_DESTINATION_KEYWORDS.some((kw) => destination.includes(kw))) {
    return `目的地"${destination}"含跨境关键词`;
  }

  return null;
}

async function checkAi(
  queryClient: QueryClient,
  task: PendingTaskEnriched,
): Promise<string | null> {
  let rec: TaskAiRecommendation;
  try {
    rec = await queryClient.fetchQuery({
      queryKey: ['aiRecommendation', task.id],
      queryFn: () => getTaskAiRecommendation(task.id),
      staleTime: 5 * 60 * 1000,
    });
  } catch {
    return null;
  }
  if (rec.error_message || !rec.recommendation) return null;
  if (rec.recommendation === 'caution' || rec.recommendation === 'reject') {
    const label = rec.recommendation === 'caution' ? 'AI 建议谨慎' : 'AI 建议驳回';
    return rec.headline ? `${label}：${rec.headline}` : label;
  }
  return null;
}
