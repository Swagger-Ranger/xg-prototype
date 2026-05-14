import { useMemo } from 'react';
import { Button, Input, Spin, Tag } from 'antd';
import { RightOutlined, RobotOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { LeaveTypeConfig, PendingTaskEnriched, RiskLevel } from '@xg1/shared';
import { getTaskAiRecommendation, type AiRecommendation } from '@/api/workflow';
import { getLeaveDetail, getLeaveTypes, leaveTypeFieldsToSchema } from '@/api/leave';
import { getApplicationDetail, getPosition } from '@/api/workStudy';
import DynamicFormDisplay from '@/components/form/DynamicFormDisplay';
import InstanceTimeline from '@/components/workflow/InstanceTimeline';
import styles from './PendingApprovalRow.module.css';

/**
 * Schema-driven rendering of the leave's form_data + attachments. Mirrors what
 * LeaveDetailDrawer shows so AI 观察员 reviewers see exactly what the standalone
 * detail page surfaces — including 证明材料 (personal.evidence), 校医院证明
 * (sick.hospital_cert), 离校时间/返校时间 (weekend), 活动名称/组织方 (official),
 * etc., which the previous hardcoded 4-key whitelist silently dropped.
 */
function LeaveFullDetailBlock({ leaveId }: { leaveId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['leaveDetail', leaveId],
    queryFn: () => getLeaveDetail(leaveId),
    staleTime: 60 * 1000,
  });

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
    enabled: !!data,
  });
  const typeExtraFields = useMemo(() => {
    const cfg = leaveTypes.find((t) => t.code === data?.leave_type_code);
    return leaveTypeFieldsToSchema(cfg?.extra_fields);
  }, [leaveTypes, data?.leave_type_code]);

  if (isLoading) return <div style={{ color: 'var(--fg-3)', fontSize: 12 }}><Spin size="small" /> 加载完整申请…</div>;
  if (error || !data) return <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>完整申请加载失败</div>;

  const hasForm = Object.keys(data.form_data ?? {}).length > 0;
  const attachments = data.attachments ?? [];
  if (!hasForm && attachments.length === 0) return null;

  return (
    <>
      {hasForm && (
        <>
          <div className={styles.section}>补充信息</div>
          <DynamicFormDisplay
            bizType="leave"
            formData={data.form_data as Record<string, unknown>}
            extraFields={typeExtraFields}
          />
        </>
      )}
      {attachments.length > 0 && (
        <>
          <div className={styles.section}>附件</div>
          {attachments.map((f) => (
            <div key={f.file_id}>
              <a href={f.file_url} target="_blank" rel="noreferrer">{f.file_name}</a>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function WorkstudyDetailBlock({ applicationId }: { applicationId: string }) {
  const { data: app, isLoading, error } = useQuery({
    queryKey: ['workstudyApplication', applicationId],
    queryFn: () => getApplicationDetail(applicationId),
    staleTime: 60 * 1000,
  });
  const { data: position } = useQuery({
    queryKey: ['workstudyPosition', app?.position_id],
    queryFn: () => getPosition(app!.position_id),
    enabled: !!app?.position_id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div style={{ color: 'var(--fg-3)', fontSize: 12 }}><Spin size="small" /> 加载申请信息…</div>;
  if (error || !app) return <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>申请信息加载失败</div>;

  return (
    <>
      <div className={styles.section}>岗位信息</div>
      <div className={styles.kv}>岗位：{position?.title ?? '-'}</div>
      {position?.department_name && <div className={styles.kv}>用人部门：{position.department_name}</div>}
      {position?.salary_amount && (
        <div className={styles.kv}>
          薪资：{position.salary_amount} 元 / {position.salary_unit ?? 'hour'}
        </div>
      )}

      <div className={styles.section}>申请信息</div>
      {app.financial_aid_level && <div className={styles.kv}>资助等级：{app.financial_aid_level}</div>}
      <div className={styles.kv}>自我介绍：{app.intro || '-'}</div>
    </>
  );
}

const AI_REC_LABEL: Record<Exclude<AiRecommendation, ''>, { label: string; color: string }> = {
  approve: { label: '建议通过', color: 'green' },
  caution: { label: '建议谨慎', color: 'gold' },
  reject: { label: '建议驳回', color: 'red' },
};

function AiRecommendationBlock({ taskId }: { taskId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['aiRecommendation', taskId],
    queryFn: () => getTaskAiRecommendation(taskId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>
        <Spin size="small" /> 正在生成 AI 建议…
      </div>
    );
  }
  if (error || !data) {
    return <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>AI 建议不可用</div>;
  }
  if (data.error_message || !data.recommendation) {
    return (
      <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>
        AI 建议不可用{data.error_message ? `（${data.error_message}）` : ''}
      </div>
    );
  }

  const rec = AI_REC_LABEL[data.recommendation];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Tag color={rec.color} style={{ margin: 0 }}>
          {rec.label}
        </Tag>
        <span style={{ fontWeight: 600 }}>{data.headline}</span>
      </div>
      {data.rationale && (
        <div style={{ whiteSpace: 'pre-wrap', marginBottom: data.checkpoints.length > 0 ? 6 : 0 }}>
          {data.rationale}
        </div>
      )}
      {data.checkpoints.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>审批前建议核实</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.checkpoints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  high: 'red',
  medium: 'gold',
  low: 'green',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const BIZ_LABEL: Record<string, string> = {
  leave: '请假',
  workstudy_application: '勤工助学',
};

interface Props {
  task: PendingTaskEnriched;
  expanded: boolean;
  onToggleExpand: () => void;
  approveComment: string;
  onApproveCommentChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isApprovePending: boolean;
}

export default function PendingApprovalRow({
  task,
  expanded,
  onToggleExpand,
  approveComment,
  onApproveCommentChange,
  onApprove,
  onReject,
  isApprovePending,
}: Props) {
  const bizLabel = BIZ_LABEL[task.biz_type ?? ''] ?? task.biz_type ?? '';
  return (
    <div className={styles.row}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.trigger}
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>
            <RightOutlined />
          </span>
          <span className={styles.main}>
            <span className={styles.title}>
              <Tag color={RISK_COLOR[task.risk_level]} style={{ margin: 0 }}>
                {RISK_LABEL[task.risk_level]}
              </Tag>
              <span>{task.initiator_name ?? '未知'}</span>
              <span className={styles.titleMeta}>
                {bizLabel} · {task.node_name}
              </span>
            </span>
            <span className={styles.sub}>{task.reasons.slice(0, 2).join('；')}</span>
          </span>
        </button>
        <div className={styles.actions}>
          <span className={styles.time}>
            {task.started_at ? dayjs(task.started_at).format('MM-DD HH:mm') : ''}
          </span>
          <Button size="small" type="primary" loading={isApprovePending} onClick={onApprove}>
            通过
          </Button>
          <Button size="small" danger onClick={onReject}>
            驳回
          </Button>
        </div>
      </div>

      {expanded && (
        <div className={styles.panel}>
          <InstanceTimeline instanceId={task.workflow_instance_id} />

          <div className={styles.section}>判定依据</div>
          <ul className={styles.reasons}>
            {task.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>

          {task.biz_type === 'leave' && (
            <>
              <div className={styles.section}>请假信息</div>
              <div className={styles.kv}>类型：{task.leave_type_name ?? '-'}</div>
              <div className={styles.kv}>时长：{task.leave_duration_days ?? '-'} 天</div>
              <div className={styles.kv}>
                时间：
                {task.leave_start_time ? dayjs(task.leave_start_time).format('MM-DD HH:mm') : '-'}
                {' → '}
                {task.leave_end_time ? dayjs(task.leave_end_time).format('MM-DD HH:mm') : '-'}
              </div>
              <div className={styles.kv}>事由：{task.leave_reason ?? '-'}</div>
              {task.biz_id && <LeaveFullDetailBlock leaveId={task.biz_id} />}
            </>
          )}

          {task.biz_type === 'workstudy_application' && task.biz_id && (
            <WorkstudyDetailBlock applicationId={task.biz_id} />
          )}

          <div className={styles.section}>学生历史</div>
          <div className={styles.kv}>近 30 天旷课：{task.applicant_stats.absent30d} 次</div>
          <div className={styles.kv}>近 30 天请假：{task.applicant_stats.leave_count30d} 次</div>
          <div className={styles.kv}>
            开放预警：紧急 {task.applicant_stats.open_alerts_critical} · 高{' '}
            {task.applicant_stats.open_alerts_high} · 中{' '}
            {task.applicant_stats.open_alerts_medium} · 低 {task.applicant_stats.open_alerts_low}
          </div>
          <div className={styles.kv}>
            违纪：未处理 {task.applicant_stats.unpunished_violations} 条 · 近 90 天{' '}
            {task.applicant_stats.violation90d} 条
          </div>

          {task.risk_level !== 'low' && (
            <>
              <div className={styles.section}>
                <RobotOutlined /> AI 建议
              </div>
              <AiRecommendationBlock taskId={task.id} />
            </>
          )}

          <div className={styles.section}>审批意见（选填）</div>
          <Input.TextArea
            className={styles.commentBox}
            rows={2}
            value={approveComment}
            onChange={(e) => onApproveCommentChange(e.target.value)}
            placeholder="留空将默认填写「同意」，学生可见"
          />
        </div>
      )}
    </div>
  );
}
