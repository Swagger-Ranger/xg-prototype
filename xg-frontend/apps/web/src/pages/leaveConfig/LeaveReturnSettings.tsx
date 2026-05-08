import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, InputNumber, Space, Spin, Switch, Tag } from 'antd';
import { EnvironmentOutlined, IdcardOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from '@/utils/antdApp';
import {
  type CampusGeofence,
  getCampusGeofence,
  updateCampusGeofence,
} from '@/api/leaveReturn';
import TencentMapPicker from '@/components/TencentMapPicker';

/**
 * 销假规则配置(销假改造后的配置面板,代替原来的 leave_return YAML 摘要)。
 *
 * 老师能改的就一组数:销假地理围栏(中心 + 半径 + 启用开关)。学生在小程序点
 * 「我已返校」时,后端拿 GPS 跟围栏比距离 — 在圈内立即销假,不在则学生可
 * 申请人工销假交辅导员审。**开关关掉 = 自助直销**,学生点一下直接销假,
 * 不判定位置 / 不审核(return_source=auto 留作 audit)。门禁系统接入是 P1 占位。
 *
 * 中心点不再走 InputNumber 手填,统一用腾讯地图点选。半径仍用 InputNumber,
 * 开关用 Switch。
 */
export default function LeaveReturnSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<CampusGeofence>({
    queryKey: ['leave-return.campus-geofence'],
    queryFn: getCampusGeofence,
    staleTime: 30 * 1000,
  });

  const [form] = Form.useForm<CampusGeofence>();
  const [dirty, setDirty] = useState(false);
  // form 当前值,实时投给地图组件做围栏可视化
  const watchedValues = Form.useWatch([], form);
  const live: CampusGeofence = {
    centerLat: Number(watchedValues?.centerLat ?? data?.centerLat ?? 29.5641),
    centerLng: Number(watchedValues?.centerLng ?? data?.centerLng ?? 106.4623),
    radiusM: Number(watchedValues?.radiusM ?? data?.radiusM ?? 500),
    enabled: Boolean(watchedValues?.enabled ?? data?.enabled ?? true),
  };

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: updateCampusGeofence,
    onSuccess: (saved) => {
      message.success('围栏已保存');
      qc.setQueryData(['leave-return.campus-geofence'], saved);
      form.setFieldsValue(saved);
      setDirty(false);
    },
    onError: (e: unknown) => {
      message.error(e instanceof Error ? e.message : '保存失败');
    },
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      saveMutation.mutate({
        centerLat: Number(values.centerLat),
        centerLng: Number(values.centerLng),
        radiusM: Number(values.radiusM),
        enabled: Boolean(values.enabled),
      });
    } catch {
      // form validation error,Antd 已展示
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        showIcon
        type="info"
        message="销假改造后,默认走「学生小程序 GPS 自助销假」,不再需要审批流"
        description="学生在围栏内点'我已返校'立即销假;围栏外可走「人工销假申请」由辅导员单步审核。配置页就这两组规则。"
      />

      <Card
        size="small"
        style={{ borderRadius: 'var(--r-lg)' }}
        title={
          <span>
            <EnvironmentOutlined /> 销假地理围栏
          </span>
        }
        extra={
          <Button
            type="primary"
            loading={saveMutation.isPending}
            disabled={!dirty}
            onClick={handleSave}
          >
            保存
          </Button>
        }
      >
        {isLoading ? (
          <Spin />
        ) : error ? (
          <Alert
            type="error"
            message="加载围栏配置失败"
            description={error instanceof Error ? error.message : String(error)}
          />
        ) : (
          <>
            {/* 启用开关 — 默认打开;关闭后整个 GPS 销假停用,学生强制走人工。 */}
            <Form
              form={form}
              layout="vertical"
              initialValues={data ?? { enabled: true }}
              onValuesChange={() => setDirty(true)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: live.enabled
                    ? 'rgba(82, 196, 26, 0.08)'
                    : 'rgba(217, 217, 217, 0.4)',
                  borderRadius: 6,
                  border: live.enabled
                    ? '1px solid rgba(82, 196, 26, 0.3)'
                    : '1px solid var(--border-1, #e5e5e5)',
                }}
              >
                <Form.Item
                  name="enabled"
                  valuePropName="checked"
                  style={{ marginBottom: 0 }}
                >
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
                {live.enabled ? (
                  <Tag color="success" style={{ margin: 0, fontWeight: 600 }}>
                    已打开
                  </Tag>
                ) : (
                  <Tag style={{ margin: 0, fontWeight: 600 }}>已关闭</Tag>
                )}
                <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                  {live.enabled
                    ? 'GPS 销假启用中。学生在围栏内点「我已返校」立即销假;围栏外可申请人工销假。'
                    : 'GPS 销假已关闭。学生点「我已返校」直接销假,不判定位置 / 不审核。'}
                </span>
              </div>

              <div style={{ marginBottom: 12, opacity: live.enabled ? 1 : 0.5 }}>
                <TencentMapPicker
                  value={{
                    centerLat: live.centerLat,
                    centerLng: live.centerLng,
                    radiusM: live.radiusM,
                  }}
                  onChange={(v) => {
                    form.setFieldsValue({ centerLat: v.centerLat, centerLng: v.centerLng });
                    setDirty(true);
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>
                  在地图上点击设新中心点;半径在下方调,圆圈实时跟随。
                </div>
              </div>

              {/* 经纬度走 hidden Form.Item 持值,UI 不渲染 — 中心点统一靠地图选 */}
              <Form.Item name="centerLat" hidden>
                <InputNumber />
              </Form.Item>
              <Form.Item name="centerLng" hidden>
                <InputNumber />
              </Form.Item>

              <Form.Item
                label="半径(米)"
                name="radiusM"
                rules={[
                  { required: true, message: '必填' },
                  { type: 'number', min: 1, max: 100000, message: '1 - 100000' },
                ]}
                style={{ marginBottom: 4 }}
              >
                <InputNumber
                  step={50}
                  style={{ width: 140 }}
                  placeholder="例:500"
                  disabled={!live.enabled}
                />
              </Form.Item>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                坐标系 GCJ-02(火星),跟微信小程序 GPS 一致;半径建议 300-1000 米。
              </div>
            </Form>
          </>
        )}
      </Card>

      <Card
        size="small"
        style={{ borderRadius: 'var(--r-lg)', opacity: 0.7 }}
        title={
          <span>
            <IdcardOutlined /> 门禁系统接入(待开通)
          </span>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
          后续接入校园门禁系统后,学生刷卡返校时门禁会推送 webhook 给本系统,
          自动销假,无需学生手动操作。当前 P1 阶段未开通。
        </div>
      </Card>
    </Space>
  );
}
