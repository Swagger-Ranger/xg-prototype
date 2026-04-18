import { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Switch,
  Button,
  Select,
  Space,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CollectionField } from '@/api/collection';
import { createForm } from '@/api/collection';

const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  title: string;
  description?: string;
  deadline?: import('dayjs').Dayjs;
  allow_edit?: boolean;
  fields?: CollectionField[];
}

const FIELD_TYPE_OPTIONS = [
  { label: '文本', value: 'text' },
  { label: '选项', value: 'select' },
  { label: '日期', value: 'date' },
  { label: '文件', value: 'file' },
];

export default function CreateFormModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createForm,
    onSuccess: () => {
      message.success('收集单创建成功');
      queryClient.invalidateQueries({ queryKey: ['collectionForms'] });
      form.resetFields();
      onClose();
    },
  });

  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    mutation.mutate({
      title: values.title,
      description: values.description,
      fields: values.fields ?? [],
      deadline: values.deadline?.toISOString(),
      allow_edit: values.allow_edit,
    });
  };

  return (
    <Modal
      title="新建收集单"
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
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="title"
          label="收集单标题"
          rules={[{ required: true, message: '请输入标题' }]}
        >
          <Input placeholder="请输入收集单标题" maxLength={100} />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <TextArea rows={2} placeholder="收集说明（可选）" maxLength={500} showCount />
        </Form.Item>

        <Form.Item name="deadline" label="截止时间">
          <DatePicker
            style={{ width: '100%' }}
            showTime
            format="YYYY-MM-DD HH:mm"
            placeholder="请选择截止时间"
          />
        </Form.Item>

        <Form.Item name="allow_edit" label="允许修改提交" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item label="收集字段">
          <Form.List name="fields">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="baseline" style={{ width: '100%' }}>
                    <Form.Item
                      name={[name, 'label']}
                      rules={[{ required: true, message: '请输入字段名' }]}
                      style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                    >
                      <Input placeholder="字段名称" />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'type']}
                      initialValue="text"
                      style={{ marginBottom: 0, width: 100 }}
                    >
                      <Select options={FIELD_TYPE_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'required']}
                      valuePropName="checked"
                      initialValue={false}
                      style={{ marginBottom: 0 }}
                    >
                      <Switch size="small" checkedChildren="必填" unCheckedChildren="选填" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ label: '', type: 'text', required: false })}
                  icon={<PlusOutlined />}
                >
                  添加字段
                </Button>
              </div>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}
