import { Modal, Form, Button, Alert } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import type { LeaveRequest } from '@xg1/shared';
import { requestLeaveReturn, type ReturnLeaveLocation } from '@/api/leave';
import { getCurrentLocation } from '@/utils/geolocation';
import { describeApiError } from '@/utils/api-error';
import DynamicFormFields from '@/components/form/DynamicFormFields';

interface Props {
  record: LeaveRequest | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReturnLeaveModal({ record, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      formData,
      location,
    }: {
      formData: Record<string, unknown>;
      location: ReturnLeaveLocation | null;
    }) => requestLeaveReturn(record!.id, formData, location),
    onSuccess: () => {
      message.success('销假申请已提交，等待辅导员审核');
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      form.resetFields();
      onSuccess();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '销假提交失败')),
  });

  const handleSubmit = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    // Date fields come back as Dayjs; serialize to YYYY-MM-DD for backend.
    const cleaned: Record<string, unknown> = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v instanceof Object && 'isValid' in (v as Dayjs)) {
        cleaned[k] = dayjs(v as Dayjs).format('YYYY-MM-DD');
      } else {
        cleaned[k] = v;
      }
    });
    const loc = await getCurrentLocation();
    if (!loc) {
      message.warning('未获取到定位（用户可能拒绝了授权），仍可提交但不会记录位置。');
    }
    const location: ReturnLeaveLocation | null = loc
      ? {
          return_latitude: loc.latitude,
          return_longitude: loc.longitude,
          return_location_at: loc.capturedAt,
        }
      : null;
    mutation.mutate({ formData: cleaned, location });
  };

  return (
    <Modal
      title={record ? `销假 — ${record.leave_type_name}` : '销假'}
      open={record !== null}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={[
        <Button
          key="cancel"
          onClick={() => {
            form.resetFields();
            onClose();
          }}
        >
          取消
        </Button>,
        <Button key="submit" type="primary" loading={mutation.isPending} onClick={handleSubmit}>
          提交销假
        </Button>,
      ]}
      width="min(560px, 100vw)"
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="销假需要辅导员审核通过后才会真正生效"
        description="提交后请假状态变为「销假待审」；通过后变为「已销」，驳回则恢复为「已批准」。"
      />
      <Form form={form} layout="vertical">
        <DynamicFormFields bizType="leave_return" />
      </Form>
    </Modal>
  );
}
