import { Drawer, Tag, Table, Button, Typography, Modal } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CheckinActivity, CheckinRecord } from '@/api/checkin';
import { getQrCode, getRecords, closeActivity } from '@/api/checkin';
import { describeApiError } from '@/utils/api-error';

const { Text } = Typography;

interface Props {
  activity: CheckinActivity | null;
  onClose: () => void;
}

const RECORD_STATUS_LABEL: Record<string, string> = {
  on_time: '准时',
  late: '迟到',
  absent: '缺勤',
};

const RECORD_STATUS_COLOR: Record<string, string> = {
  on_time: '#16a34a',
  late: '#ea580c',
  absent: '#dc2626',
};

export default function ActivityDetailDrawer({ activity, onClose }: Props) {
  const open = activity !== null;
  const queryClient = useQueryClient();

  const { data: qrData } = useQuery({
    queryKey: ['checkinQr', activity?.id],
    queryFn: () => getQrCode(activity!.id),
    enabled: open && activity?.checkin_mode === 'qr_scan' && activity?.status === 'active',
    refetchInterval: 30_000,
  });

  const { data: records = [] } = useQuery({
    queryKey: ['checkinRecords', activity?.id],
    queryFn: () => getRecords(activity!.id),
    enabled: open,
    refetchInterval: activity?.status === 'active' ? 10_000 : false,
  });

  const closeMutation = useMutation({
    mutationFn: () => closeActivity(activity!.id),
    onSuccess: () => {
      message.success('签到已结束');
      queryClient.invalidateQueries({ queryKey: ['checkinActivities'] });
      queryClient.invalidateQueries({ queryKey: ['checkinRecords', activity?.id] });
      onClose();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '结束签到失败，请重试')),
  });

  const columns: ColumnsType<CheckinRecord> = [
    {
      title: '学生',
      dataIndex: 'student_name',
      width: 100,
      render: (v: string, r) => v ?? r.student_id,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: string) => {
        const color = RECORD_STATUS_COLOR[status] ?? '#6b7280';
        const label = RECORD_STATUS_LABEL[status] ?? status;
        return (
          <Tag
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}40`,
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
            }}
          >
            {label}
          </Tag>
        );
      },
    },
    {
      title: '签到时间',
      dataIndex: 'checked_in_at',
      width: 130,
      render: (v: string | null) => (v ? dayjs(v).format('HH:mm:ss') : '—'),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 80,
    },
  ];

  const statusLabel = activity?.status === 'active' ? '进行中' : '已结束';
  const statusColor = activity?.status === 'active' ? '#2563eb' : '#9ca3af';

  return (
    <Drawer
      title={
        <span>
          {activity?.title ?? '签到详情'}
          <Tag
            style={{
              marginLeft: 8,
              backgroundColor: `${statusColor}18`,
              color: statusColor,
              border: `1px solid ${statusColor}40`,
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
            }}
          >
            {statusLabel}
          </Tag>
        </span>
      }
      open={open}
      onClose={onClose}
      width={600}
      extra={
        activity?.status === 'active' && (
          <Button
            danger
            loading={closeMutation.isPending}
            onClick={() => Modal.confirm({
              title: '确认结束签到',
              content: '确定要结束该签到活动吗？此操作不可撤销。',
              okText: '确定',
              cancelText: '取消',
              onOk: () => closeMutation.mutate(),
            })}
          >
            结束签到
          </Button>
        )
      }
    >
      {activity?.checkin_mode === 'qr_scan' && activity?.status === 'active' && (
        <div
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--bd)',
            borderRadius: 'var(--r-lg)',
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--fg)' }}>二维码信息</div>
          {qrData ? (
            <>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Payload: </Text>
                <Text code style={{ fontSize: 12 }}>{qrData.payload}</Text>
              </div>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>有效至: </Text>
                <Text style={{ fontSize: 12 }}>{dayjs(qrData.expires_at).format('HH:mm:ss')}</Text>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>已签到: </Text>
                <Text strong style={{ fontSize: 12 }}>{qrData.signed_count} / {qrData.expected_count}</Text>
              </div>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>加载中...</Text>
          )}
        </div>
      )}

      <div style={{ marginBottom: 12, color: 'var(--fg-3)', fontSize: 13 }}>
        共 {records.length} 条签到记录
      </div>

      <Table<CheckinRecord>
        rowKey="id"
        columns={columns}
        dataSource={records}
        size="middle"
        pagination={false}
      />
    </Drawer>
  );
}
