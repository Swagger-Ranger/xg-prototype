import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined, PhoneOutlined } from '@ant-design/icons';
import { Button, Collapse, Descriptions, Empty, Modal, Space, Spin, Table, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  getCrisisSignal,
  closeCrisisSignal,
  type CrisisSignalDetail,
} from '@/api/crisis';

/**
 * 危机详情（设计 §4/§5，PRD §9.5）。两区物理分离、降级边界硬隔离：
 * - 区一（处理必须）：纯 DB，永远渲染；辅导员靠它「找到人、核实、关闭」。
 * - 区二（辅助判断）：折叠；关怀历史/请假/违纪纯 DB，小夕画像缺失即降级，
 *   绝不影响区一与区二其余内容。
 *
 * 打开本页即在服务端写一条 view 审计（设计 §5，比普通关怀更严）。
 * v1 动作只「已核实并关闭」（设计 §4.4）；转介/升级在 backlog。
 */
function fmt(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('zh-CN', { hour12: false });
}

/** 命中类别 → 人话。临床分类桶，不是学生原话（设计 §5）。 */
function categoryLabel(c: string | null): string {
  if (c === 'safety') return '安全危机类（高危表达）';
  if (c === 'basic_needs') return '基本生存求助';
  return '未分类';
}

export default function CrisisDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['crisis.detail', id],
    queryFn: () => getCrisisSignal(id),
    enabled: !!id,
  });

  const closeM = useMutation({
    mutationFn: () => closeCrisisSignal(id),
    onSuccess: () => {
      message.success('已标记核实并关闭');
      qc.invalidateQueries({ queryKey: ['crisis.list'] });
      navigate('/care');
    },
    onError: (e) => message.error(describeApiError(e, '关闭失败')),
  });

  if (q.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/care')}>
          返回
        </Button>
        <p style={{ marginTop: 16 }}>线索不存在或无权查看。</p>
      </div>
    );
  }

  const d: CrisisSignalDetail = q.data;
  const closed = d.status === 'closed';

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto', paddingBottom: 88 }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate('/care')} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>{d.student_name ?? '未知学生'}</span>
          {d.class_name && <span style={{ color: '#6b7280' }}>· {d.class_name}</span>}
        </Space>
        <Tag color={closed ? 'default' : 'red'}>{closed ? '已关闭' : '待人工核实'}</Tag>
      </div>

      {/* 区一 · 危机处理必须信息（纯 DB，永远渲染） */}
      <div
        style={{
          marginTop: 16,
          border: '1px solid #ffccc7',
          borderRadius: 8,
          background: '#fff2f0',
          padding: '14px 16px',
        }}
      >
        <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 10 }}>
          危机处理必须信息
        </div>
        <div style={{ marginBottom: 12, fontSize: 15 }}>
          <b>为什么触发：</b>
          <Tag color={d.category === 'safety' ? 'red' : 'orange'}>
            {categoryLabel(d.category)}
          </Tag>
          <span style={{ color: '#94a3b8' }}>
            命中类别（分诊用，非学生原话；具体内容请电话/当面向本人核实）
          </span>
        </div>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="学生">{d.student_name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="学号">{d.student_no ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="班级">{d.class_name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="年级">{d.grade ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="触发时间">{fmt(d.created_at)}</Descriptions.Item>
          <Descriptions.Item label="信号版本">{d.rule_version ?? '—'}</Descriptions.Item>
          {closed && (
            <Descriptions.Item label="关闭时间">{fmt(d.handled_at)}</Descriptions.Item>
          )}
        </Descriptions>
        <div style={{ marginTop: 12 }}>
          {d.phone ? (
            <Button type="primary" danger icon={<PhoneOutlined />} href={`tel:${d.phone}`}>
              一键拨号 {d.phone}
            </Button>
          ) : (
            <span style={{ color: '#94a3b8' }}>该学生未登记手机号</span>
          )}
        </div>
      </div>

      {/* 区二 · 平时关怀信息 辅助判断（折叠；小夕画像可降级） */}
      <Collapse
        style={{ marginTop: 16 }}
        defaultActiveKey={['care', 'leave', 'violation']}
        items={[
          {
            key: 'care',
            label: `历史关怀（共 ${d.care_history_count} 次已结束）`,
            children: d.recent_care.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => `c${i}`}
                dataSource={d.recent_care}
                columns={[
                  { title: '严重度', dataIndex: 'severity' },
                  { title: '状态', dataIndex: 'status' },
                  { title: '关闭原因', dataIndex: 'closed_reason', render: (v) => v ?? '—' },
                  { title: '时间', dataIndex: 'created_at', render: fmt },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关怀记录" />
            ),
          },
          {
            key: 'leave',
            label: `近期请假（${d.recent_leave.length}）`,
            children: d.recent_leave.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => `l${i}`}
                dataSource={d.recent_leave}
                columns={[
                  { title: '类型', dataIndex: 'leave_type_name', render: (v) => v ?? '—' },
                  { title: '事由', dataIndex: 'reason', render: (v) => v ?? '—' },
                  { title: '开始', dataIndex: 'start_time', render: fmt },
                  { title: '结束', dataIndex: 'end_time', render: fmt },
                  { title: '状态', dataIndex: 'status', render: (v) => v ?? '—' },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无请假记录" />
            ),
          },
          {
            key: 'violation',
            label: `近期违纪（${d.recent_violation.length}）`,
            children: d.recent_violation.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => `v${i}`}
                dataSource={d.recent_violation}
                columns={[
                  { title: '类别', dataIndex: 'category', render: (v) => v ?? '—' },
                  { title: '说明', dataIndex: 'description', render: (v) => v ?? '—' },
                  { title: '发生时间', dataIndex: 'occurred_at', render: fmt },
                  { title: '审批', dataIndex: 'approval_status', render: (v) => v ?? '—' },
                  {
                    title: '处分',
                    dataIndex: 'punishment_level',
                    render: (v, r) =>
                      v ? `${v}（${r.punishment_status ?? '—'}）` : '—',
                  },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无违纪记录" />
            ),
          },
          {
            key: 'brief',
            label: '小夕画像（复用最近关怀分析，不触发新分析）',
            children: d.brief ? (
              <div style={{ color: '#475569' }}>
                {d.brief.why && (
                  <p>
                    <b>为什么关注：</b>
                    {d.brief.why}
                  </p>
                )}
                {!!d.brief.talking_points?.length && (
                  <>
                    <b>可以聊：</b>
                    <ul>
                      {d.brief.talking_points.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                {!!d.brief.avoid_topics?.length && (
                  <>
                    <b>本次不宜触碰：</b>
                    <ul>
                      {d.brief.avoid_topics.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                暂无可用画像（AI 降级，不影响危机处理）。
              </span>
            ),
          },
        ]}
      />

      {/* 操作区（粘性底部）；v1 只「已核实并关闭」 */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#fff',
          borderTop: '1px solid var(--ant-color-border, #e5e7eb)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {closed ? (
          <span style={{ color: '#94a3b8' }}>该线索已关闭，仅供查看。</span>
        ) : (
          <Button
            type="primary"
            danger
            loading={closeM.isPending}
            onClick={() =>
              Modal.confirm({
                title: '确认已电话/当面核实并关闭？',
                content: '关闭表示你已人工触达该学生。请仅在确实联系到本人后操作。',
                okText: '确认核实并关闭',
                onOk: () => closeM.mutateAsync(),
              })
            }
          >
            已电话/当面核实并关闭
          </Button>
        )}
      </div>
    </div>
  );
}
