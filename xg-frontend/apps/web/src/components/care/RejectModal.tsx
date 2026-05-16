import { useState, useEffect } from 'react';
import { Modal, Select, Input } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import { rejectCareTask, type CareTaskView, type RejectReasonCode } from '@/api/care';

const REASONS: { value: RejectReasonCode; label: string }[] = [
  { value: 'rule_not_applicable', label: '规则不适用' },
  { value: 'student_special_case', label: '学生情况特殊' },
  { value: 'handled_offline', label: '已线下处理' },
  { value: 'already_transferred', label: '已另行转介' },
  { value: 'other', label: '其他' },
];

/** 拒绝弹窗（W1 §9.3）。reasonCode 必选（后端 @Pattern 硬校验）。 */
export function RejectModal({
  task,
  onClose,
  onSuccess,
}: {
  task: CareTaskView | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<RejectReasonCode | undefined>();
  const [reasonDetail, setReasonDetail] = useState('');
  useEffect(() => {
    if (task) {
      setReasonCode(undefined);
      setReasonDetail('');
    }
  }, [task]);

  const m = useMutation({
    mutationFn: () => rejectCareTask(task!.taskId, reasonCode!, reasonDetail || undefined),
    onSuccess: () => {
      message.success('已拒绝');
      onSuccess();
      onClose();
    },
    onError: (e) => message.error(describeApiError(e, '拒绝失败')),
  });

  return (
    <Modal
      title="拒绝任务"
      open={!!task}
      onCancel={onClose}
      onOk={() => {
        if (!reasonCode) {
          message.warning('请选择拒绝原因');
          return;
        }
        m.mutate();
      }}
      confirmLoading={m.isPending}
      okText="确认拒绝"
      okButtonProps={{ danger: true }}
    >
      <div style={{ marginBottom: 8 }}>拒绝原因（必选）：</div>
      <Select
        style={{ width: '100%' }}
        placeholder="请选择原因"
        value={reasonCode}
        onChange={setReasonCode}
        options={REASONS}
      />
      <div style={{ margin: '12px 0 8px' }}>补充说明（可选）：</div>
      <Input.TextArea
        rows={3}
        maxLength={1000}
        value={reasonDetail}
        onChange={(e) => setReasonDetail(e.target.value)}
      />
    </Modal>
  );
}
