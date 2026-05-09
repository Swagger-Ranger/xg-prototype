import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Spin,
  Switch,
  Tag,
} from 'antd';
import { FileTextOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  type LeaveNoticeConfig,
  getLeaveNoticeConfig,
  updateLeaveNoticeConfig,
} from '@/api/leave';

/**
 * 「请假须知」配置面板 —— 仅作用于学生端请假申请:
 *   1. 进入请假页弹「说明」(noticeEnabled / noticeText)
 *   2. 提交前弹「承诺书」(commitmentEnabled / commitmentText / commitmentCountdownSec)
 *
 * 老师 / 辅导员代请假不弹。后端缺值走内置默认文案,所以这里 Form
 * 一打开就有完整内容。
 */
export default function LeaveNoticeSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<LeaveNoticeConfig>({
    queryKey: ['leave-notice.config'],
    queryFn: getLeaveNoticeConfig,
    staleTime: 30 * 1000,
  });

  const [form] = Form.useForm<LeaveNoticeConfig>();
  const [dirty, setDirty] = useState(false);
  const watched = Form.useWatch([], form);

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: updateLeaveNoticeConfig,
    onSuccess: (saved) => {
      message.success('已保存');
      qc.setQueryData(['leave-notice.config'], saved);
      form.setFieldsValue(saved);
      setDirty(false);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败,请重试')),
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      saveMutation.mutate(values);
    } catch {
      // antd 已展示校验错误
    }
  };

  if (isLoading) {
    return (
      <Card style={{ borderRadius: 'var(--r-lg)' }}>
        <Spin />
      </Card>
    );
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="加载请假须知配置失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  const noticeEnabled = Boolean(watched?.notice_enabled ?? data?.notice_enabled ?? true);
  const commitmentEnabled = Boolean(
    watched?.commitment_enabled ?? data?.commitment_enabled ?? true,
  );

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        showIcon
        type="info"
        message="只对学生端请假申请生效"
        description="进入请假页弹「说明」,点提交前弹「承诺书」(复选框 + 倒计时);老师/辅导员代请假不弹。"
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={data}
        onValuesChange={() => setDirty(true)}
      >
        <Card
          size="small"
          style={{ borderRadius: 'var(--r-lg)' }}
          title={
            <span>
              <FileTextOutlined /> 请假说明（进入请假页弹一次）
            </span>
          }
          extra={
            <Form.Item name="notice_enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          }
        >
          {noticeEnabled ? (
            <Tag color="success" style={{ marginBottom: 8 }}>已启用</Tag>
          ) : (
            <Tag style={{ marginBottom: 8 }}>已关闭</Tag>
          )}
          <Form.Item
            name="notice_text"
            rules={[
              { required: noticeEnabled, message: '启用时说明文本不能为空' },
              { max: 2000, message: '说明文本最多 2000 字' },
            ]}
            style={{ marginBottom: 4 }}
          >
            <Input.TextArea
              autoSize={{ minRows: 6, maxRows: 14 }}
              placeholder="请假流程说明 / 政策提示"
              disabled={!noticeEnabled}
            />
          </Form.Item>
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            学生进入请假申请页时弹一次,仅展示与关闭按钮,不需要勾选。
          </div>
        </Card>

        <Card
          size="small"
          style={{ borderRadius: 'var(--r-lg)', marginTop: 12 }}
          title={
            <span>
              <SafetyCertificateOutlined /> 请假承诺书（提交前必勾）
            </span>
          }
          extra={
            <Form.Item name="commitment_enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          }
        >
          {commitmentEnabled ? (
            <Tag color="success" style={{ marginBottom: 8 }}>已启用</Tag>
          ) : (
            <Tag style={{ marginBottom: 8 }}>已关闭</Tag>
          )}
          <Form.Item
            name="commitment_text"
            rules={[
              { required: commitmentEnabled, message: '启用时承诺书文本不能为空' },
              { max: 4000, message: '承诺书文本最多 4000 字' },
            ]}
            style={{ marginBottom: 8 }}
          >
            <Input.TextArea
              autoSize={{ minRows: 8, maxRows: 18 }}
              placeholder="请假安全承诺书内容"
              disabled={!commitmentEnabled}
            />
          </Form.Item>
          <Form.Item
            label="倒计时(秒)"
            name="commitment_countdown_sec"
            rules={[
              { required: true, message: '必填' },
              { type: 'number', min: 0, max: 60, message: '0 - 60' },
            ]}
            style={{ marginBottom: 4 }}
            tooltip="承诺书弹出后,需等待倒计时结束「我已阅读」复选框才允许勾选"
          >
            <InputNumber min={0} max={60} step={1} style={{ width: 120 }} disabled={!commitmentEnabled} />
          </Form.Item>
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            学生提交请假时弹出,需等倒计时结束、勾选「本人已阅读并同意」后才能继续提交。
          </div>
        </Card>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          loading={saveMutation.isPending}
          disabled={!dirty}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
    </Space>
  );
}
