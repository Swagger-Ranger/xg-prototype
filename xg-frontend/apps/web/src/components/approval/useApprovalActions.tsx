import { useRef, useState } from 'react';
import { Input, Modal } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PendingTaskEnriched } from '@xg1/shared';
import {
  approveTask,
  batchApproveTasks,
  logAiRecommendation,
  rejectTask,
  type TaskAiRecommendation,
} from '@/api/workflow';
import { BIZ_LABEL } from './PendingApprovalRow';
import type { DroppedTask } from './lowRiskFilter';
import { describeApiError } from '@/utils/api-error';

// Pull whatever AI recommendation the approver was looking at out of
// react-query's cache. It's keyed by taskId (set in PendingApprovalRow when
// the row was expanded). Returns undefined when the user approved without
// ever opening the panel — the log row still gets written, just with no AI
// snapshot, which cleanly separates "approver ignored AI" (visible but
// disagreed) from "approver never saw AI" (panel stayed collapsed).
function readAiRec(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
): TaskAiRecommendation | undefined {
  return queryClient.getQueryData<TaskAiRecommendation>(['aiRecommendation', taskId]);
}

export function useApprovalActions() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [approveComments, setApproveComments] = useState<Record<string, string>>({});
  const [rejectTarget, setRejectTarget] = useState<PendingTaskEnriched | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  // Hold the task object across mutation start → onSuccess so we can attach
  // biz_type / biz_id to the feedback log without going back to the cache.
  const approveTaskRef = useRef<PendingTaskEnriched | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingEnriched'] });
    queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approveTask(id, comment),
    onSuccess: (_, vars) => {
      message.success('已批准');
      const task = approveTaskRef.current;
      if (task && task.id === vars.id) {
        const aiRec = readAiRec(queryClient, vars.id);
        logAiRecommendation({
          task_id: vars.id,
          biz_type: task.biz_type ?? undefined,
          biz_id: task.biz_id ?? undefined,
          ai_recommendation: aiRec?.recommendation || undefined,
          ai_headline: aiRec?.headline || undefined,
          ai_rationale: aiRec?.rationale || undefined,
          ai_model: aiRec?.model || undefined,
          human_decision: 'approve',
          human_comment: vars.comment,
        });
      }
      approveTaskRef.current = null;
      setApproveComments((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      invalidate();
    },
    onError: (e: unknown) => {
      approveTaskRef.current = null;
      message.error(describeApiError(e, '操作失败'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectTask(id, comment),
    onSuccess: (_, vars) => {
      message.success('已驳回');
      const task = rejectTarget;
      if (task && task.id === vars.id) {
        const aiRec = readAiRec(queryClient, vars.id);
        logAiRecommendation({
          task_id: vars.id,
          biz_type: task.biz_type ?? undefined,
          biz_id: task.biz_id ?? undefined,
          ai_recommendation: aiRec?.recommendation || undefined,
          ai_headline: aiRec?.headline || undefined,
          ai_rationale: aiRec?.rationale || undefined,
          ai_model: aiRec?.model || undefined,
          human_decision: 'reject',
          human_comment: vars.comment,
        });
      }
      setRejectTarget(null);
      setRejectComment('');
      invalidate();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '操作失败')),
  });

  const batchMutation = useMutation({
    mutationFn: (ids: string[]) => batchApproveTasks(ids, 'approve', '系统判定低风险，批量通过'),
    onSuccess: (_, ids) => {
      message.success(`已批量通过 ${ids.length} 条低风险任务`);
      invalidate();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '批量操作失败')),
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setApproveComment = (id: string, value: string) => {
    setApproveComments((prev) => ({ ...prev, [id]: value }));
  };

  const approve = (task: PendingTaskEnriched) => {
    // Default to "同意" when the approver leaves the comment blank — keeps a
    // non-empty record on the timeline. Reject still requires the approver
    // to type a real reason; we don't ship a default for it.
    const trimmed = approveComments[task.id]?.trim();
    approveTaskRef.current = task;
    approveMutation.mutate({
      id: task.id,
      comment: trimmed && trimmed.length > 0 ? trimmed : '同意',
    });
  };

  const confirmBatchApprove = (
    ids: string[],
    context?: { totalCandidates: number; dropped: DroppedTask[] },
  ) => {
    const dropped = context?.dropped ?? [];
    const totalCandidates = context?.totalCandidates ?? ids.length;
    const droppedList = dropped.length > 0 ? (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          已自动剔除 {dropped.length} 条，需要逐条审批：
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflowY: 'auto' }}>
          {dropped.map((d) => (
            <li key={d.taskId}>
              {d.studentName}：{d.reason}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

    if (ids.length === 0) {
      Modal.info({
        title: '暂无可一键通过的任务',
        content: (
          <div>
            <div>
              规则判定为低风险的 {totalCandidates} 条任务，全部经 AI 二次审核或硬性兜底规则识别为需要逐条审批。
            </div>
            {droppedList}
          </div>
        ),
        okText: '我知道了',
      });
      return;
    }
    Modal.confirm({
      title: `确认一键通过 ${ids.length} 条低风险任务？`,
      content: (
        <div>
          <div>
            这些任务的申请人近期无旷课、无预警、无未处理违纪，本次请假 ≤ 3 天，且通过 AI 二次审核。
          </div>
          {droppedList}
        </div>
      ),
      okText: '确认通过',
      onOk: () => batchMutation.mutateAsync(ids),
    });
  };

  return {
    expanded,
    toggleExpand,
    approveComments,
    setApproveComment,
    approve,
    isApprovePending: (taskId: string) =>
      approveMutation.isPending && approveMutation.variables?.id === taskId,
    openReject: (task: PendingTaskEnriched) => {
      setRejectTarget(task);
      setRejectComment('');
    },
    batchMutation,
    confirmBatchApprove,
    rejectTarget,
    rejectComment,
    setRejectComment,
    rejectMutation,
    closeReject: () => {
      setRejectTarget(null);
      setRejectComment('');
    },
  };
}

export type ApprovalActions = ReturnType<typeof useApprovalActions>;

export function ApprovalRejectModal({ actions }: { actions: ApprovalActions }) {
  return (
    <Modal
      open={actions.rejectTarget !== null}
      title={`驳回 ${actions.rejectTarget?.initiator_name ?? ''} 的${
        BIZ_LABEL[actions.rejectTarget?.biz_type ?? ''] ?? ''
      }申请`}
      okText="确认驳回"
      okButtonProps={{ danger: true, loading: actions.rejectMutation.isPending }}
      onOk={() => {
        if (!actions.rejectTarget) return;
        actions.rejectMutation.mutate({
          id: actions.rejectTarget.id,
          comment: actions.rejectComment,
        });
      }}
      onCancel={actions.closeReject}
    >
      <Input.TextArea
        rows={3}
        value={actions.rejectComment}
        onChange={(e) => actions.setRejectComment(e.target.value)}
        placeholder="驳回理由（建议填写，学生可见）"
      />
    </Modal>
  );
}
