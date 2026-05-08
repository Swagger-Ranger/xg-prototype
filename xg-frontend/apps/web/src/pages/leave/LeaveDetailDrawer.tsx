import { useMemo, useState } from 'react';
import { Drawer, Tag, Button, Descriptions, Typography, Divider, Space, Modal, Tooltip } from 'antd';
import { ReadOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaveRequest, LeaveTypeConfig, PendingTaskEnriched } from '@xg1/shared';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from '@xg1/shared';
import {
  getLeaveTypes,
  leaveTypeFieldsToSchema,
  withdrawLeave,
  getLeaveImpact,
  type LeaveImpactView,
} from '@/api/leave';
import DynamicFormDisplay from '@/components/form/DynamicFormDisplay';
import InstanceTimeline from '@/components/workflow/InstanceTimeline';
import ReturnLeaveModal from './ReturnLeaveModal';
import styles from './detail.module.css';
import { describeApiError } from '@/utils/api-error';
import { osmMapUrl } from '@/utils/geolocation';
import { useAuth } from '@/hooks/useAuth';

const { Text } = Typography;

interface Props {
  record: LeaveRequest | null;
  onClose: () => void;
  /**
   * The pending workflow task assigned to the current user for this record,
   * if any. When set (and status === 'pending'), the drawer renders 批准 /
   * 驳回 buttons that delegate to {@link onApprove} / {@link onReject}. The
   * parent page owns the actual approve/reject modals so the drawer stays
   * a thin viewer.
   */
  pendingTask?: PendingTaskEnriched | null;
  onApprove?: () => void;
  onReject?: () => void;
}

export default function LeaveDetailDrawer({ record, onClose, pendingTask, onApprove, onReject }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [returningRecord, setReturningRecord] = useState<LeaveRequest | null>(null);

  // 撤回 / 申请销假 are applicant-only actions: backend checks
  // studentId.equals(leave.getStudentId()) on both endpoints. Gate the
  // buttons so 辅导员 / 院长 / 管理员 don't see them on others' records.
  const isApplicant = !!user && !!record && String(user.id) === String(record.student_id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    onClose();
  };

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawLeave(record!.id),
    onSuccess: invalidate,
    onError: (e: unknown) => message.error(describeApiError(e, '撤回申请失败，请重试')),
  });

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
    enabled: !!record,
  });

  // 影响课程:辅导员/院长/管理员审批时辅助决策。后端按 leave.studentId 算,
  // 全局开关关掉后返 zero 视图,前端按 totalPeriods 判空隐藏整块。
  const { data: impact } = useQuery<LeaveImpactView>({
    queryKey: ['leaveImpact', record?.id],
    queryFn: () => getLeaveImpact(record!.id),
    enabled: !!record,
    staleTime: 60 * 1000,
  });
  const impactCourseNames = useMemo(() => {
    if (!impact) return [];
    const seen = new Set<string>();
    for (const d of impact.by_day) {
      for (const c of d.courses) if (c.course_name) seen.add(c.course_name);
    }
    return Array.from(seen);
  }, [impact]);
  const typeExtraFields = useMemo(() => {
    const cfg = leaveTypes.find((t) => t.code === record?.leave_type_code);
    return leaveTypeFieldsToSchema(cfg?.extra_fields);
  }, [leaveTypes, record?.leave_type_code]);

  if (!record) return null;

  const statusColor = LEAVE_STATUS_COLORS[record.status];
  const statusLabel = LEAVE_STATUS_LABELS[record.status];

  return (
    <Drawer
      title="请假详情"
      open={!!record}
      onClose={onClose}
      width="min(520px, 100vw)"
      extra={
        <Space>
          {/* Approver actions — only when current user owns the pending task.
              Buttons delegate to parent-owned modals (same flow as list page),
              so the drawer doesn't reimplement approve/reject UI. */}
          {pendingTask && record.status === 'pending' && onApprove && (
            <Button size="small" type="primary" onClick={onApprove}>
              批准
            </Button>
          )}
          {pendingTask && record.status === 'pending' && onReject && (
            <Button size="small" danger onClick={onReject}>
              驳回
            </Button>
          )}
          {isApplicant && record.status === 'pending' && (
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
          {isApplicant && record.status === 'approved' && (
            <Button size="small" onClick={() => setReturningRecord(record)}>
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

        {impact && impact.total_periods > 0 && (
          <Tooltip
            placement="top"
            color="#fff"
            overlayInnerStyle={{ color: '#333', maxWidth: 360 }}
            title={
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {impact.by_day.map((d) => (
                  <div key={d.date}>
                    <strong>{dayjs(d.date).format('M/D')}</strong>(周
                    {['一', '二', '三', '四', '五', '六', '日'][d.day_of_week - 1]}):
                    {d.courses
                      .map((c) => `${c.course_name} ${c.start_period}-${c.end_period}节`)
                      .join('、')}
                  </div>
                ))}
              </div>
            }
          >
            <div
              style={{
                marginTop: 12,
                padding: '6px 10px',
                background: 'var(--warn-bg, #fffbe6)',
                border: '1px solid var(--warn-border, #ffe58f)',
                borderRadius: 4,
                fontSize: 12,
                color: 'var(--fg-2, #595959)',
                cursor: 'help',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ReadOutlined style={{ color: '#d48806' }} />
              <span>
                该时段会缺 <b>{impact.total_periods}</b> 节课
                ({impact.total_courses} 门):
                {impactCourseNames.slice(0, 4).join('、')}
                {impactCourseNames.length > 4 ? '…' : ''}
              </span>
            </div>
          </Tooltip>
        )}

        {Object.keys(record.form_data ?? {}).length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>附加信息</Text>
            <div style={{ marginTop: 8 }}>
              <DynamicFormDisplay
                bizType="leave"
                formData={record.form_data as Record<string, unknown>}
                extraFields={typeExtraFields}
              />
            </div>
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

        {(record.apply_latitude != null || record.return_latitude != null) && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>提交定位</Text>
            <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
              {record.apply_latitude != null && record.apply_longitude != null && (
                <Descriptions.Item label="申请定位">
                  <LocationCell
                    lat={Number(record.apply_latitude)}
                    lng={Number(record.apply_longitude)}
                    capturedAt={record.apply_location_at ?? null}
                  />
                </Descriptions.Item>
              )}
              {record.return_latitude != null && record.return_longitude != null && (
                <Descriptions.Item label="销假定位">
                  <LocationCell
                    lat={Number(record.return_latitude)}
                    lng={Number(record.return_longitude)}
                    capturedAt={record.return_location_at ?? null}
                  />
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}

        {record.workflow_instance_id && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Text className={styles.sectionTitle}>审批进度</Text>
            <InstanceTimeline instanceId={record.workflow_instance_id} />
          </>
        )}

      </div>
      <ReturnLeaveModal
        record={returningRecord}
        onClose={() => setReturningRecord(null)}
        onSuccess={() => {
          setReturningRecord(null);
          invalidate();
        }}
      />
    </Drawer>
  );
}

function LocationCell({
  lat,
  lng,
  capturedAt,
}: {
  lat: number;
  lng: number;
  capturedAt: string | null;
}) {
  return (
    <Space direction="vertical" size={2}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {lat.toFixed(6)}, {lng.toFixed(6)}{' '}
        <a href={osmMapUrl(lat, lng)} target="_blank" rel="noreferrer">
          在地图打开
        </a>
      </span>
      {capturedAt && (
        <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>
          捕获时间: {dayjs(capturedAt).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      )}
    </Space>
  );
}
