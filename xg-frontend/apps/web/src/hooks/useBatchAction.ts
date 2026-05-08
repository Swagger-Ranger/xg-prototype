import { useCallback } from 'react';
import {  } from 'antd';
import { message } from '@/utils/antdApp';
import { useBatchActionStore } from '@/stores/batch-action.store';
import type { PinnedRef } from '@/stores/ai-action.store';
import { useAuth } from '@/hooks/useAuth';
import { buildLeaveApprovalSpec } from '@/components/batch/registry';

export type BatchActionType =
  | 'leave_approve'
  | 'leave_reject';

interface OpenOpts {
  actionType: BatchActionType;
  refs: PinnedRef[];
  /** Optional override of drawer title (falls back to registry default). */
  title?: string;
}

/**
 * Imperative entry point for opening the batch-action drawer. Handles
 * 1) showing a preparing spinner while the registry resolves refs → items,
 * 2) committing the spec to the store when ready,
 * 3) surfacing prepare errors without breaking the UI.
 */
export function useBatchAction() {
  const openLoading = useBatchActionStore((s) => s.openLoading);
  const openWithSpec = useBatchActionStore((s) => s.openWithSpec);
  const setPrepareError = useBatchActionStore((s) => s.setPrepareError);
  const close = useBatchActionStore((s) => s.close);
  const { user } = useAuth();

  const open = useCallback(
    async (opts: OpenOpts) => {
      const assigneeId = user?.id;
      const preTitle =
        opts.title ??
        (opts.actionType === 'leave_approve' ? '批量批准请假' : '批量驳回请假');
      openLoading(preTitle, '正在加载待审批任务…');
      try {
        if (opts.actionType === 'leave_approve' || opts.actionType === 'leave_reject') {
          const { spec } = await buildLeaveApprovalSpec(opts.refs, {
            assigneeId,
            title: opts.title,
            mode: opts.actionType === 'leave_approve' ? 'approve' : 'reject',
          });
          openWithSpec(spec);
          if (spec.items.length === 0) {
            setPrepareError('所选对象中没有可执行的请假任务');
          }
        } else {
          setPrepareError(`未支持的操作类型：${opts.actionType}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : '准备执行数据失败';
        setPrepareError(reason);
        message.warning(reason);
      }
    },
    [user?.id, openLoading, openWithSpec, setPrepareError],
  );

  return { open, close };
}
