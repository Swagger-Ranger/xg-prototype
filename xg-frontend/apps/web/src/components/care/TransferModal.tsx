import { useState, useEffect } from 'react';
import { Modal, Select, Input } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import { transferCareTask, type CareTaskView, type TransferTargetDept } from '@/api/care';

const DEPTS: { value: TransferTargetDept; label: string }[] = [
  { value: 'counseling_center', label: '心理咨询中心' },
  { value: 'aid_office', label: '资助管理办公室' },
  { value: 'academic_affairs', label: '教务处' },
  { value: 'security', label: '保卫处' },
];

/** 转介弹窗（W1 §9.3）。目标部门 + 说明均必填（后端硬校验）。 */
export function TransferModal({
  task,
  onClose,
  onSuccess,
}: {
  task: CareTaskView | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [targetDept, setTargetDept] = useState<TransferTargetDept | undefined>();
  const [reasonDetail, setReasonDetail] = useState('');
  useEffect(() => {
    if (task) {
      setTargetDept(undefined);
      setReasonDetail('');
    }
  }, [task]);

  const m = useMutation({
    mutationFn: () => transferCareTask(task!.task_id, targetDept!, reasonDetail.trim()),
    onSuccess: () => {
      message.success('已转介');
      onSuccess();
      onClose();
    },
    onError: (e) => message.error(describeApiError(e, '转介失败')),
  });

  return (
    <Modal
      title="转介"
      open={!!task}
      onCancel={onClose}
      onOk={() => {
        if (!targetDept) {
          message.warning('请选择转介目标部门');
          return;
        }
        if (!reasonDetail.trim()) {
          message.warning('请填写转介说明');
          return;
        }
        m.mutate();
      }}
      confirmLoading={m.isPending}
      okText="确认转介"
    >
      <div style={{ marginBottom: 8 }}>目标部门（必选）：</div>
      <Select
        style={{ width: '100%' }}
        placeholder="请选择部门"
        value={targetDept}
        onChange={setTargetDept}
        options={DEPTS}
      />
      <div style={{ margin: '12px 0 8px' }}>转介说明（必填）：</div>
      <Input.TextArea
        rows={3}
        maxLength={1000}
        value={reasonDetail}
        onChange={(e) => setReasonDetail(e.target.value)}
      />
    </Modal>
  );
}
