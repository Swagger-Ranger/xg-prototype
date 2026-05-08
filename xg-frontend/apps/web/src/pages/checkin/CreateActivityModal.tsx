import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Radio, Switch, Button } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createActivity } from '@/api/checkin';
import { describeApiError } from '@/utils/api-error';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  title: string;
  duration_minutes: number;
  checkin_mode: 'qr_scan' | 'roll_call';
  late_threshold_minutes: number;
  enable_checkout: boolean;
}

export default function CreateActivityModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createActivity,
    onSuccess: () => {
      message.success('签到活动创建成功');
      queryClient.invalidateQueries({ queryKey: ['checkinActivities'] });
      form.resetFields();
      onClose();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '创建签到活动失败，请重试')),
  });

  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    mutation.mutate(values);
  };

  return (
    <Modal
      title="创建签到"
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
          创建
        </Button>,
      ]}
      width={480}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
        initialValues={{
          checkin_mode: 'qr_scan',
          late_threshold_minutes: 5,
          duration_minutes: 60,
          enable_checkout: false,
        }}
      >
        <Form.Item
          name="title"
          label="签到名称"
          rules={[{ required: true, message: '请输入签到名称' }]}
        >
          <Input placeholder="请输入签到活动名称" maxLength={100} />
        </Form.Item>

        <Form.Item
          name="duration_minutes"
          label="签到时长（分钟）"
          rules={[{ required: true, message: '请输入签到时长' }]}
        >
          <InputNumber min={1} max={1440} style={{ width: '100%' }} addonAfter="分钟" />
        </Form.Item>

        <Form.Item name="checkin_mode" label="签到方式">
          <Radio.Group>
            <Radio value="qr_scan">二维码</Radio>
            <Radio value="roll_call">点名</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="late_threshold_minutes" label="迟到阈值（分钟）">
          <InputNumber min={0} max={120} style={{ width: '100%' }} addonAfter="分钟" />
        </Form.Item>

        <Form.Item name="enable_checkout" label="开启签退" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
