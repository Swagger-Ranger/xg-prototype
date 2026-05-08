import { useEffect } from 'react';
import { AutoComplete, Button, Form, Input, Spin, Typography } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTenantSettings, updateTenantSettings } from '@/api/tenantSettings';
import { SCHOOL_CITY_OPTIONS } from '@/constants/schoolCities';
import { describeApiError } from '@/utils/api-error';

const { Text } = Typography;

interface FormValues {
  school_name: string;
  school_city: string | null;
}

export default function SchoolInfoSection() {
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const { data, isLoading } = useQuery({
    queryKey: ['tenantSettings'],
    queryFn: getTenantSettings,
  });

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        school_name: data.school_name ?? '',
        school_city: data.school_city ?? null,
      });
    }
  }, [data, form]);

  const mut = useMutation({
    mutationFn: updateTenantSettings,
    onSuccess: () => {
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['tenantSettings'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });

  if (isLoading) return <Spin />;

  return (
    <div style={{ maxWidth: 520 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          mut.mutate({
            school_name: values.school_name?.trim() || undefined,
            school_city: values.school_city || null,
          })
        }
      >
        <Form.Item
          name="school_name"
          label="学校名称"
          rules={[{ required: true, message: '请填写学校名称' }, { max: 200 }]}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              登录页大标题、顶栏、邮件 / 通知模板里都会用到这个名字
            </Text>
          }
        >
          <Input placeholder="例：杭州师范大学" allowClear />
        </Form.Item>

        <Form.Item
          name="school_city"
          label="学校所在城市"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              下拉建议覆盖 ~120 个常用城市；不在列表的也可手动输入。
              仅 WeatherClient 白名单内的城市天气段才会渲染，其他静默跳过
            </Text>
          }
        >
          <AutoComplete
            placeholder="选择或输入城市"
            options={SCHOOL_CITY_OPTIONS}
            allowClear
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={mut.isPending}>
            保存
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
