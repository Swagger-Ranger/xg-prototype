import { useEffect } from 'react';
import { AutoComplete, Button, Divider, Form, Input, Modal, Space, Spin, Switch, Typography } from 'antd';
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

  const residentialEnabled = data?.enable_residential_track ?? false;

  const handleToggleResidential = (next: boolean) => {
    if (next) {
      Modal.confirm({
        title: '启用书院制双轨视图？',
        content:
          '启用后,「学生信息 / 班级看板」会多一组书院 / 楼栋维度,辅导员可同时挂学院班 + 书院班。请先在《组织架构》导入书院树和学生绑定,否则相关页面会是空的。',
        okText: '启用',
        cancelText: '取消',
        onOk: () => mut.mutate({ enable_residential_track: true }),
      });
    } else {
      Modal.confirm({
        title: '关闭书院制？',
        content: '关闭后所有书院相关入口、筛选和列将隐藏。已配置的书院树和学生绑定不会丢失,再次启用即可恢复。',
        okText: '关闭',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => mut.mutate({ enable_residential_track: false }),
      });
    }
  };

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

      <Divider style={{ margin: '8px 0 16px' }} />

      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space align="center">
          <Text strong>启用书院制</Text>
          <Switch
            checked={residentialEnabled}
            loading={mut.isPending}
            onChange={handleToggleResidential}
          />
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          关闭(默认):学院单轨,UI 跟启用前一致。开启后「学生信息 / 班级看板」多一组
          书院 / 楼栋维度,辅导员可同时挂学院班 + 书院班。关闭仅隐藏入口,不会删除已配置的书院树和学生绑定
        </Text>
      </Space>
    </div>
  );
}
