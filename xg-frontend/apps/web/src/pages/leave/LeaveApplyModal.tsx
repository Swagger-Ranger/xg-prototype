import { useEffect } from 'react';
import { Modal, Form, Select, DatePicker, Input, Button, InputNumber, message } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveTypeConfig } from '@xg1/shared';
import { getLeaveTypes, applyLeave } from '@/api/leave';
import { useAIActionStore } from '@/stores/ai-action.store';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: Record<string, unknown>;
}

interface FormValues {
  leave_type_code: string;
  date_range: [Dayjs, Dayjs];
  reason: string;
  [key: string]: unknown;
}

export default function LeaveApplyModal({ open, onClose, prefill }: Props) {
  const [form] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();
  const emitEvent = useAIActionStore((s) => s.emitEvent);

  const leaveTypeCode = Form.useWatch('leave_type_code', form);
  const dateRange = Form.useWatch('date_range', form);

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
  });

  const selectedType = leaveTypes.find((t) => t.code === leaveTypeCode);

  const durationDays =
    dateRange?.[0] && dateRange?.[1]
      ? dateRange[1].diff(dateRange[0], 'day') + 1
      : 0;

  const mutation = useMutation({
    mutationFn: applyLeave,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      message.success('请假申请已提交');
      emitEvent('leave_submitted', {
        leave_type_code: variables.leave_type_code,
        reason: variables.reason,
        start_time: variables.start_time,
        end_time: variables.end_time,
      });
      form.resetFields();
      onClose();
    },
    onError: () => {
      message.error('请假申请提交失败，请重试');
    },
  });

  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  useEffect(() => {
    if (open && prefill) {
      const values: Record<string, unknown> = {};
      if (prefill.leave_type) values.leave_type_code = prefill.leave_type;
      if (prefill.reason) values.reason = prefill.reason;
      if (prefill.start_date && prefill.end_date) {
        values.date_range = [dayjs(prefill.start_date as string), dayjs(prefill.end_date as string)];
      } else if (prefill.start_date) {
        values.date_range = [dayjs(prefill.start_date as string), dayjs(prefill.start_date as string)];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setFieldsValue(values as any);

      // Auto-submit if AI requested direct submission
      if (prefill._autoSubmit) {
        setTimeout(() => handleSubmit(), 300);
      }
    }
  }, [open, prefill, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const extra_data: Record<string, unknown> = {};
    if (selectedType?.extra_fields) {
      for (const field of selectedType.extra_fields) {
        if (values[field.field_key] !== undefined) {
          extra_data[field.field_key] = values[field.field_key];
        }
      }
    }
    mutation.mutate({
      leave_type_code: values.leave_type_code,
      start_time: values.date_range[0].toISOString(),
      end_time: values.date_range[1].toISOString(),
      reason: values.reason,
      extra_data,
    });
  };

  return (
    <Modal
      title="申请请假"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={mutation.isPending}
          onClick={handleSubmit}
        >
          提交申请
        </Button>,
      ]}
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="leave_type_code"
          label="假别"
          rules={[{ required: true, message: '请选择假别' }]}
        >
          <Select placeholder="请选择假别" options={leaveTypes.map((t) => ({ label: t.name, value: t.code }))} />
        </Form.Item>

        <Form.Item
          name="date_range"
          label="请假时间"
          rules={[{ required: true, message: '请选择请假时间' }]}
        >
          <RangePicker style={{ width: '100%' }} showTime={false} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.Item label="请假天数">
          <InputNumber value={durationDays} disabled style={{ width: '100%' }} suffix="天" />
        </Form.Item>

        <Form.Item
          name="reason"
          label="请假原因"
          rules={[{ required: true, message: '请填写请假原因' }]}
        >
          <TextArea rows={3} placeholder="请填写请假原因" maxLength={500} showCount />
        </Form.Item>

        {(typeof selectedType?.extra_fields === 'string'
          ? JSON.parse(selectedType.extra_fields)
          : selectedType?.extra_fields ?? []
        ).map((field: { field_key: string; field_label: string; field_type: string; required: boolean; options?: string[] }) => {
          if (field.field_type === 'select') {
            return (
              <Form.Item
                key={field.field_key}
                name={field.field_key}
                label={field.field_label}
                rules={[{ required: field.required, message: `请选择${field.field_label}` }]}
              >
                <Select
                  placeholder={`请选择${field.field_label}`}
                  options={field.options?.map((o) => ({ label: o, value: o }))}
                />
              </Form.Item>
            );
          }
          if (field.field_type === 'date') {
            return (
              <Form.Item
                key={field.field_key}
                name={field.field_key}
                label={field.field_label}
                rules={[{ required: field.required, message: `请选择${field.field_label}` }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            );
          }
          return (
            <Form.Item
              key={field.field_key}
              name={field.field_key}
              label={field.field_label}
              rules={[{ required: field.required, message: `请填写${field.field_label}` }]}
            >
              <Input placeholder={`请填写${field.field_label}`} />
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}
