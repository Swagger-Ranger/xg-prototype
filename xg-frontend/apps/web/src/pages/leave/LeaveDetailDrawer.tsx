import { Drawer, Tag, Button, Descriptions, Timeline, Typography, Divider, Space, message, Modal } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveRequest } from '@xg1/shared';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from '@xg1/shared';
import { withdrawLeave, cancelLeave } from '@/api/leave';
import styles from './detail.module.css';

const { Text } = Typography;

const FIELD_LABELS: Record<string, string> = {
  leave_type: '请假类型',
  reason: '请假原因',
  destination: '目的地',
  hospital_name: '医院名称',
  emergency_contact: '紧急联系人',
  emergency_phone: '联系电话',
};

interface Props {
  record: LeaveRequest | null;
  onClose: () => void;
}

export default function LeaveDetailDrawer({ record, onClose }: Props) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    onClose();
  };

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawLeave(record!.id),
    onSuccess: invalidate,
    onError: () => {
      message.error('撤回申请失败，请重试');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelLeave(record!.id),
    onSuccess: invalidate,
    onError: () => {
      message.error('销假申请失败，请重试');
    },
  });

  if (!record) return null;

  const statusColor = LEAVE_STATUS_COLORS[record.status];
  const statusLabel = LEAVE_STATUS_LABELS[record.status];

  const aiFields = record.ai_draft?.predicted_fields
    ? Object.entries(record.ai_draft.predicted_fields)
    : [];

  return (
    <Drawer
      title="请假详情"
      open={!!record}
      onClose={onClose}
      width={520}
      extra={
        <Space>
          {record.status === 'pending' && (
            <Button
              size="small"
              danger
              loading={withdrawMutation.isPending}
              onClick={() => Modal.confirm({
                title: '确认撤回',
                content: '确定要撤回该请假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => withdrawMutation.mutate(),
              })}
            >
              撤回申请
            </Button>
          )}
          {record.status === 'approved' && (
            <Button
              size="small"
              loading={cancelMutation.isPending}
              onClick={() => Modal.confirm({
                title: '确认销假',
                content: '确定要提交销假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => cancelMutation.mutate(),
              })}
            >
              申请销假
            </Button>
          )}
        </Space>
      }
    >
      <div className={styles.drawerBody}>
        <div className={styles.statusRow}>
          <Tag
            style={{
              backgroundColor: `${statusColor}18`,
              color: statusColor,
              border: `1px solid ${statusColor}40`,
              fontWeight: 500,
              fontSize: 13,
              padding: '3px 10px',
            }}
          >
            {statusLabel}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            创建于 {dayjs(record.created_at).format('YYYY-MM-DD HH:mm')}
          </Text>
        </div>

        <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="学生姓名">{record.student_name}</Descriptions.Item>
          <Descriptions.Item label="假别">{record.leave_type_name}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{dayjs(record.start_time).format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{dayjs(record.end_time).format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="请假天数">{record.duration_days} 天</Descriptions.Item>
          <Descriptions.Item label="请假原因">{record.reason}</Descriptions.Item>
        </Descriptions>

        {Object.keys(record.form_data ?? {}).length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>附加信息</Text>
            <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
              {Object.entries(record.form_data).map(([k, v]) => (
                <Descriptions.Item key={k} label={FIELD_LABELS[k] ?? k}>
                  {String(v)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </>
        )}

        {record.attachments?.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>附件</Text>
            <div style={{ marginTop: 8 }}>
              {record.attachments.map((f) => (
                <div key={f.file_id}>
                  <a href={f.file_url} target="_blank" rel="noreferrer">
                    {f.file_name}
                  </a>
                </div>
              ))}
            </div>
          </>
        )}

        {record.workflow_instance_id && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>审批进度</Text>
            <Timeline
              style={{ marginTop: 12 }}
              items={[
                { children: '提交申请', color: 'green' },
                { children: '辅导员审批中', color: record.status === 'pending' ? 'blue' : 'green' },
                {
                  children: record.status === 'approved' ? '审批通过' : record.status === 'rejected' ? '审批驳回' : '等待结果',
                  color: record.status === 'approved' ? 'green' : record.status === 'rejected' ? 'red' : 'gray',
                },
              ]}
            />
          </>
        )}

        {record.ai_draft && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>AI 辅助填写对比</Text>
            <div className={styles.aiDraftBox}>
              <div className={styles.aiMeta}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  模型: {record.ai_draft.model} · 置信度: {Math.round(record.ai_draft.confidence * 100)}%
                </Text>
              </div>
              {aiFields.length > 0 ? (
                <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
                  {aiFields.map(([k, v]) => (
                    <Descriptions.Item key={k} label={k}>
                      <Text style={{ color: 'var(--ac)' }}>{String(v)}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>无预测字段</Text>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
