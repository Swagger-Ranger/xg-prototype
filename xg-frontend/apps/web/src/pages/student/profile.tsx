import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Descriptions, Empty, Spin, Table, Tabs, Tag } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getStudent } from '@/api/student';
import { listAlerts, type StudentAlert } from '@/api/alert';
import {
  listCounselorTalks,
  type CounselorTalk,
  type CounselorTalkTopic,
} from '@/api/counselorTalk';
import {
  listPunishments,
  listViolations,
  type Punishment,
  type ViolationRecord,
} from '@/api/violation';
import EventTimeline from '@/components/student/EventTimeline';
import ExtendedInfoSection from '@/components/student/ExtendedInfoSection';
import InsightPanel from '@/components/student/InsightPanel';
import AskAIChip from '@/components/ai/AskAIChip';
import PinToAIButton from '@/components/ai/PinToAIButton';
import styles from './profile.module.css';

const STATUS_LABELS: Record<string, string> = {
  active: '在读',
  suspended: '休学',
  graduated: '毕业',
  withdrawn: '退学',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'var(--ok)',
  suspended: 'var(--warn)',
  graduated: 'var(--fg-4)',
  withdrawn: 'var(--danger)',
};
const TOPIC_LABELS: Record<CounselorTalkTopic, string> = {
  academic: '学业',
  mental: '心理',
  discipline: '纪律',
  career: '职业',
  other: '其他',
};
const ALERT_STATUS_COLORS: Record<string, string> = {
  open: 'red',
  acknowledged: 'gold',
  resolved: 'green',
  false_positive: 'default',
};
const ALERT_SEVERITY_COLORS: Record<string, string> = {
  low: 'blue',
  medium: 'gold',
  high: 'orange',
  critical: 'red',
};

function fmtDate(s: string | null | undefined) {
  return s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—';
}

function riskBand(openAlerts: number, violations: number): {
  level: 'low' | 'medium' | 'high';
  label: string;
  hint: string;
} {
  const score = openAlerts * 2 + violations;
  if (score >= 6) return { level: 'high', label: '高', hint: `未闭环预警 ${openAlerts} · 违纪 ${violations}` };
  if (score >= 2) return { level: 'medium', label: '中', hint: `未闭环预警 ${openAlerts} · 违纪 ${violations}` };
  return { level: 'low', label: '低', hint: `未闭环预警 ${openAlerts} · 违纪 ${violations}` };
}

export default function StudentProfile() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: student, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => getStudent(id),
    enabled: !!id,
  });

  // Fact tables (event/alert/violation/punishment/talk) all key by sys_user.id,
  // not student_profile.id. Always use user_id for these queries.
  const factId = student?.user_id ?? '';

  const alerts = useQuery({
    queryKey: ['studentProfile', 'alerts', factId],
    queryFn: () => listAlerts({ page: 1, size: 50, student_id: factId }),
    enabled: !!factId,
  });

  const violations = useQuery({
    queryKey: ['studentProfile', 'violations', factId],
    queryFn: () => listViolations({ page: 1, size: 50, student_id: factId }),
    enabled: !!factId,
  });

  const punishments = useQuery({
    queryKey: ['studentProfile', 'punishments', factId],
    queryFn: () => listPunishments({ page: 1, size: 50, student_id: factId }),
    enabled: !!factId,
  });

  const talks = useQuery({
    queryKey: ['studentProfile', 'talks', factId],
    queryFn: () => listCounselorTalks({ page: 1, size: 50, student_id: factId }),
    enabled: !!factId,
  });

  const alertRows = alerts.data?.data ?? [];
  const violationRows = violations.data?.data ?? [];
  const punishmentRows = punishments.data?.data ?? [];
  const talkRows = talks.data?.data ?? [];

  const openAlertCount = alertRows.filter((a) => a.status === 'open').length;
  const risk = useMemo(
    () => riskBand(openAlertCount, violationRows.length),
    [openAlertCount, violationRows.length],
  );

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Spin />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className={styles.page}>
        <button className={styles.backLink} onClick={() => navigate('/student')}>
          <ArrowLeftOutlined /> 返回学生信息库
        </button>
        <Empty description="学生不存在" />
      </div>
    );
  }

  const initials = student.name?.slice(-2) || '·';
  const statusColor = STATUS_COLORS[student.status] ?? 'var(--fg-3)';
  const statusLabel = STATUS_LABELS[student.status] ?? student.status;
  const refData = {
    type: 'student' as const,
    id: String(student.id),
    label: student.name,
    detail: `${student.student_no} · ${student.grade} · ${student.class_name}`,
  };

  const violationCols: ColumnsType<ViolationRecord> = [
    { title: '时间', dataIndex: 'occurred_at', width: 150, render: fmtDate },
    { title: '类别', dataIndex: 'category', width: 120 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'approval_status', width: 100 },
  ];
  const punishmentCols: ColumnsType<Punishment> = [
    { title: '生效日期', dataIndex: 'effective_date', width: 120 },
    { title: '等级', dataIndex: 'level', width: 100 },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100 },
  ];
  const alertCols: ColumnsType<StudentAlert> = [
    { title: '触发时间', dataIndex: 'created_at', width: 150, render: fmtDate },
    { title: '规则', dataIndex: 'rule_name', ellipsis: true },
    {
      title: '等级',
      dataIndex: 'severity',
      width: 80,
      render: (v: string) => <Tag color={ALERT_SEVERITY_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => <Tag color={ALERT_STATUS_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
  ];
  const talkCols: ColumnsType<CounselorTalk> = [
    { title: '时间', dataIndex: 'talk_at', width: 150, render: fmtDate },
    {
      title: '主题',
      dataIndex: 'topic',
      width: 90,
      render: (v: CounselorTalkTopic) => <Tag>{TOPIC_LABELS[v] ?? v}</Tag>,
    },
    { title: '辅导员', dataIndex: 'counselor_name', width: 100 },
    { title: '要点', dataIndex: 'content', ellipsis: true },
  ];

  const tabItems = [
    {
      key: 'profile',
      label: '基本资料',
      children: (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="学号">{student.student_no}</Descriptions.Item>
          <Descriptions.Item label="姓名">{student.name}</Descriptions.Item>
          <Descriptions.Item label="性别">
            {student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : student.gender || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="年级">{student.grade}</Descriptions.Item>
          <Descriptions.Item label="培养层次">{student.education_level}</Descriptions.Item>
          <Descriptions.Item label="学院">{student.college}</Descriptions.Item>
          <Descriptions.Item label="专业">{student.major}</Descriptions.Item>
          <Descriptions.Item label="班级">{student.class_name}</Descriptions.Item>
          <Descriptions.Item label="手机号">{student.phone}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{student.email}</Descriptions.Item>
          <Descriptions.Item label="入学日期">{student.enrollment_date}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag
              className={styles.statusTag}
              style={{
                backgroundColor: `${statusColor}18`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
              }}
            >
              {statusLabel}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="建档时间">{student.created_at}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'extended',
      label: '扩展信息',
      children: (
        <ExtendedInfoSection
          studentId={String(student.id)}
          extendedInfo={student.extended_info}
        />
      ),
    },
    {
      key: 'academic',
      label: '学业',
      children: (
        <Empty
          description={
            <span>
              暂未接入教务系统
              <div className={styles.emptyHint}>
                P1 将对接课程成绩、学分、奖助记录
              </div>
            </span>
          }
        />
      ),
    },
    {
      key: 'behavior',
      label: '行为',
      children: (
        <>
          <div className={styles.sectionTitle}>事件时间线（近 30 条）</div>
          <EventTimeline studentId={student.user_id} />

          <div className={styles.sectionTitle}>违纪记录</div>
          <Table<ViolationRecord>
            rowKey="id"
            size="small"
            columns={violationCols}
            dataSource={violationRows}
            loading={violations.isLoading}
            pagination={false}
            locale={{ emptyText: '暂无违纪' }}
          />

          <div className={styles.sectionTitle}>处分记录</div>
          <Table<Punishment>
            rowKey="id"
            size="small"
            columns={punishmentCols}
            dataSource={punishmentRows}
            loading={punishments.isLoading}
            pagination={false}
            locale={{ emptyText: '暂无处分' }}
          />
        </>
      ),
    },
    {
      key: 'talks',
      label: '辅导与沟通',
      children: (
        <>
          <div className={styles.sectionTitle}>辅导谈话</div>
          <Table<CounselorTalk>
            rowKey="id"
            size="small"
            columns={talkCols}
            dataSource={talkRows}
            loading={talks.isLoading}
            pagination={false}
            locale={{ emptyText: '暂无谈话记录' }}
          />

          <div className={styles.sectionTitle}>预警历史</div>
          <Table<StudentAlert>
            rowKey="id"
            size="small"
            columns={alertCols}
            dataSource={alertRows}
            loading={alerts.isLoading}
            pagination={false}
            locale={{ emptyText: '暂无预警' }}
          />
        </>
      ),
    },
    {
      key: 'ai',
      label: 'AI 洞察',
      children: (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>未闭环预警</div>
              <div className={styles.kpiValue}>{openAlertCount}</div>
              <div className={styles.kpiHint}>共 {alertRows.length} 条历史预警</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>累计违纪</div>
              <div className={styles.kpiValue}>{violationRows.length}</div>
              <div className={styles.kpiHint}>处分 {punishmentRows.length} 次</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>近期谈话</div>
              <div className={styles.kpiValue}>{talkRows.length}</div>
              <div className={styles.kpiHint}>覆盖全部主题</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>综合风险</div>
              <div className={`${styles.kpiValue} ${styles[`risk${risk.level[0].toUpperCase()}${risk.level.slice(1)}` as keyof typeof styles]}`}>
                {risk.label}
              </div>
              <div className={styles.kpiHint}>{risk.hint}</div>
            </div>
          </div>
          <InsightPanel profileId={String(student.id)} />
        </>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <button className={styles.backLink} onClick={() => navigate('/student')}>
        <ArrowLeftOutlined /> 返回学生信息库
      </button>

      <div className={styles.overview}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.meta}>
          <div className={styles.metaName}>
            <span className={styles.name}>{student.name}</span>
            <span className={styles.studentNo}>{student.student_no}</span>
          </div>
          <div className={styles.metaSub}>
            {student.grade} · {student.education_level} · {student.college} · {student.major} · {student.class_name}
          </div>
          <div className={styles.tagRow}>
            <Tag
              className={styles.statusTag}
              style={{
                backgroundColor: `${statusColor}18`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
              }}
            >
              {statusLabel}
            </Tag>
            {openAlertCount > 0 && <Tag color="red">未闭环预警 {openAlertCount}</Tag>}
            {violationRows.length > 0 && <Tag color="orange">违纪 {violationRows.length}</Tag>}
            {talkRows.length > 0 && <Tag color="blue">谈话 {talkRows.length}</Tag>}
            <PinToAIButton refData={refData} />
            <AskAIChip
              refData={refData}
              prompt="请基于 {label} 近 30 天的考勤、请假、违纪、预警情况，给出整体风险画像和下一步建议。"
            />
          </div>
        </div>
        <div className={styles.riskCard}>
          <div className={styles.riskLabel}>AI 风险指数</div>
          <div
            className={`${styles.riskValue} ${
              risk.level === 'high' ? styles.riskHigh : risk.level === 'medium' ? styles.riskMedium : styles.riskLow
            }`}
          >
            {risk.label}
          </div>
          <div className={styles.riskHint}>{risk.hint}</div>
        </div>
      </div>

      <div className={styles.tabCard}>
        <Tabs defaultActiveKey="profile" items={tabItems} />
      </div>
    </div>
  );
}
