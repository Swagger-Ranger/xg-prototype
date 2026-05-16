import { useState, useEffect } from 'react';
import { Modal, Radio } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import { rescheduleCareTask, RESCHEDULE_DAYS, type CareTaskView } from '@/api/care';

/** 改期弹窗（W1 §9.3）。days 仅 1/3/7（后端硬校验）。 */
export function RescheduleModal({
  task,
  onClose,
  onSuccess,
}: {
  task: CareTaskView | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [days, setDays] = useState<number>(3);
  useEffect(() => {
    if (task) setDays(3);
  }, [task]);

  const m = useMutation({
    mutationFn: () => rescheduleCareTask(task!.taskId, days),
    onSuccess: () => {
      message.success('已改期');
      onSuccess();
      onClose();
    },
    onError: (e) => message.error(describeApiError(e, '改期失败')),
  });

  return (
    <Modal
      title="改期"
      open={!!task}
      onCancel={onClose}
      onOk={() => m.mutate()}
      confirmLoading={m.isPending}
      okText="确认改期"
    >
      <div style={{ marginBottom: 8 }}>顺延天数：</div>
      <Radio.Group value={days} onChange={(e) => setDays(e.target.value)}>
        {RESCHEDULE_DAYS.map((d) => (
          <Radio.Button key={d} value={d}>
            {d} 天
          </Radio.Button>
        ))}
      </Radio.Group>
    </Modal>
  );
}
