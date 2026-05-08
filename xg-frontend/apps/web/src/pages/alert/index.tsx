import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Drawer, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Upload } from 'antd';
import { message } from '@/utils/antdApp';
import { ThunderboltOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import AIRuleAuthorModal from '@/components/alert/AIRuleAuthorModal';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  acknowledgeAlert,
  createAlertRule,
  deleteAlertRule,
  getAlert,
  getAlertRule,
  listAlerts,
  listAlertRuleStats,
  markAlertFalsePositive,
  patchAlertRule,
  resolveAlert,
  triggerAlertScan,
  type AlertRuleDetail,
  type AlertRuleStat,
  type AlertSeverity,
  type AlertStatus,
  type StudentAlert,
} from '@/api/alert';
import styles from './index.module.css';

const { TextArea } = Input;

const SEVERITY_MAP: Record<AlertSeverity, { label: string; color: string }> = {
  low: { label: '低', color: '#52c41a' },
  medium: { label: '中', color: '#faad14' },
  high: { label: '高', color: '#fa8c16' },
  critical: { label: '紧急', color: '#cf1322' },
};

const STATUS_MAP: Record<AlertStatus, { label: string; color: string }> = {
  open: { label: '未处理', color: 'red' },
  acknowledged: { label: '已关注', color: 'orange' },
  resolved: { label: '已解决', color: 'green' },
  false_positive: { label: '误报', color: 'default' },
};

const PAGE_SIZE = 20;

type ActionType = 'acknowledge' | 'resolve' | 'false_positive';

const ACTION_LABEL: Record<ActionType, string> = {
  acknowledge: '标记为关注',
  resolve: '标记为解决',
  false_positive: '标记为误报',
};

function renderSeverity(s: AlertSeverity) {
  const conf = SEVERITY_MAP[s];
  return (
    <Tag
      className={styles.severityTag}
      style={{
        backgroundColor: `${conf.color}18`,
        color: conf.color,
        borderColor: `${conf.color}40`,
      }}
    >
      {conf.label}
    </Tag>
  );
}

function renderStatus(s: AlertStatus) {
  const conf = STATUS_MAP[s];
  return <Tag color={conf.color} className={styles.statusTag}>{conf.label}</Tag>;
}

export default function AlertManagement() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AlertStatus | undefined>('open');
  const [severity, setSeverity] = useState<AlertSeverity | undefined>(undefined);
  const [studentId, setStudentId] = useState<string>('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const [actionOpen, setActionOpen] = useState<{ id: string; type: ActionType } | null>(null);
  const [actionNote, setActionNote] = useState('');

  const listQuery = useQuery({
    queryKey: ['alerts', { page, status, severity, studentId }],
    queryFn: () =>
      listAlerts({
        page,
        size: PAGE_SIZE,
        status,
        severity,
        student_id: studentId.trim() || undefined,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ['alert', detailId],
    queryFn: () => getAlert(detailId!),
    enabled: detailId !== null,
  });

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['alert'] });
    queryClient.invalidateQueries({ queryKey: ['alertSummary'] });
    queryClient.invalidateQueries({ queryKey: ['alertRuleStats'] });
  };

  const scanMutation = useMutation({
    mutationFn: triggerAlertScan,
    onSuccess: ({ inserted }) => {
      message.success(`扫描完成，新增 ${inserted} 条告警`);
      invalidateAlerts();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '扫描失败，请稍后再试')),
  });

  const ackMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => acknowledgeAlert(id, note),
    onSuccess: () => {
      message.success('已标记为关注');
      setActionOpen(null);
      setActionNote('');
      invalidateAlerts();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '操作失败')),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => resolveAlert(id, note),
    onSuccess: () => {
      message.success('已标记为解决');
      setActionOpen(null);
      setActionNote('');
      invalidateAlerts();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '操作失败')),
  });

  const fpMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => markAlertFalsePositive(id, note),
    onSuccess: () => {
      message.success('已标记为误报');
      setActionOpen(null);
      setActionNote('');
      invalidateAlerts();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '操作失败')),
  });

  const handleAction = () => {
    if (!actionOpen) return;
    const note = actionNote.trim() || undefined;
    if (actionOpen.type === 'acknowledge') ackMutation.mutate({ id: actionOpen.id, note });
    else if (actionOpen.type === 'resolve') resolveMutation.mutate({ id: actionOpen.id, note });
    else fpMutation.mutate({ id: actionOpen.id, note });
  };

  const columns: ColumnsType<StudentAlert> = [
    { title: '学生 ID', dataIndex: 'student_id', width: 110 },
    { title: '规则', dataIndex: 'rule_name', width: 140 },
    { title: '级别', dataIndex: 'severity', width: 80, render: renderSeverity },
    { title: '状态', dataIndex: 'status', width: 100, render: renderStatus },
    {
      title: '命中说明',
      dataIndex: 'trigger_data',
      ellipsis: true,
      render: (v: StudentAlert['trigger_data']) => {
        if (v?.explanation) return v.explanation;
        const raw = v as Record<string, unknown>;
        const count = raw?.actual_count ?? raw?.count;
        const windowDays = raw?.window_days;
        const types = raw?.matched_types;
        if (Array.isArray(types)) return `跨 ${types.length} 种事件 / ${windowDays} 天`;
        if (count !== undefined) return `${count} 次 / ${windowDays} 天`;
        return JSON.stringify(v);
      },
    },
    {
      title: '产生时间',
      dataIndex: 'created_at',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, r) => (
        <>
          <button className={styles.actionLink} onClick={() => setDetailId(r.id)}>
            详情
          </button>
          <button
            className={styles.actionLink}
            style={{ marginLeft: 8 }}
            disabled={r.status !== 'open'}
            onClick={() => {
              setActionOpen({ id: r.id, type: 'acknowledge' });
              setActionNote('');
            }}
          >
            关注
          </button>
          <button
            className={styles.actionLink}
            style={{ marginLeft: 8 }}
            disabled={r.status === 'resolved' || r.status === 'false_positive'}
            onClick={() => {
              setActionOpen({ id: r.id, type: 'resolve' });
              setActionNote('');
            }}
          >
            解决
          </button>
          <button
            className={styles.actionLink}
            style={{ marginLeft: 8 }}
            disabled={r.status === 'resolved' || r.status === 'false_positive'}
            onClick={() => {
              setActionOpen({ id: r.id, type: 'false_positive' });
              setActionNote('');
            }}
          >
            误报
          </button>
        </>
      ),
    },
  ];

  const detail = detailQuery.data;

  const listTab = (
    <>
      <div className={styles.filterBar}>
        <Select
          placeholder="状态"
          style={{ width: 140 }}
          allowClear
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: '未处理', value: 'open' },
            { label: '已关注', value: 'acknowledged' },
            { label: '已解决', value: 'resolved' },
            { label: '误报', value: 'false_positive' },
          ]}
        />
        <Select
          placeholder="级别"
          style={{ width: 140 }}
          allowClear
          value={severity}
          onChange={(v) => {
            setSeverity(v);
            setPage(1);
          }}
          options={[
            { label: '紧急', value: 'critical' },
            { label: '高', value: 'high' },
            { label: '中', value: 'medium' },
            { label: '低', value: 'low' },
          ]}
        />
        <Input
          placeholder="学生 ID"
          style={{ width: 200 }}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          onPressEnter={() => setPage(1)}
          allowClear
        />
      </div>

      <div className={styles.tableCard}>
        <Table<StudentAlert>
          rowKey="id"
          columns={columns}
          dataSource={listQuery.data?.data ?? []}
          loading={listQuery.isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: Number(listQuery.data?.total ?? 0),
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>
    </>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>异常预警</h1>
        <div className={styles.actions}>
          <Button onClick={() => scanMutation.mutate()} loading={scanMutation.isPending}>
            立即扫描
          </Button>
        </div>
      </div>

      <Tabs
        defaultActiveKey="list"
        items={[
          { key: 'list', label: '告警列表', children: listTab },
          { key: 'rules', label: '规则运维', children: <AlertRulesTab /> },
        ]}
      />

      <Drawer
        title="告警详情"
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        width={520}
        extra={
          detail && (
            <Button
              size="small"
              onClick={() => navigate(`/student?studentId=${detail.student_id}&tab=timeline`)}
            >
              查看学生档案
            </Button>
          )
        }
      >
        {detail && (
          <div className={styles.drawerBody}>
            <Field label="学生 ID" value={detail.student_id} />
            <Field label="规则" value={detail.rule_name} />
            <Field label="级别" value={renderSeverity(detail.severity)} />
            <Field label="状态" value={renderStatus(detail.status)} />
            {detail.trigger_data?.explanation && (
              <Field label="命中说明" value={detail.trigger_data.explanation} />
            )}
            {detail.trigger_data?.rule_hit && (
              <Field label="规则条件" value={detail.trigger_data.rule_hit} />
            )}
            {Array.isArray(detail.trigger_data?.matched_events) && detail.trigger_data.matched_events.length > 0 && (
              <Field
                label={`相关事件（${detail.trigger_data.matched_events.length}）`}
                value={
                  <ul className={styles.eventList}>
                    {detail.trigger_data.matched_events.map((ev) => (
                      <li key={String(ev.id)}>{ev.summary}</li>
                    ))}
                  </ul>
                }
              />
            )}
            {Array.isArray(detail.trigger_data?.re_fires) && detail.trigger_data.re_fires.length > 0 && (
              <Field
                label={`再次触发记录（${detail.trigger_data.re_fires.length}）`}
                value={
                  <ul className={styles.eventList}>
                    {detail.trigger_data.re_fires.map((r, i) => (
                      <li key={i}>
                        {dayjs(r.re_fired_at).format('MM-DD HH:mm')} — 命中数 {r.previous_count} → {r.new_count}
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
            <Field
              label="原始数据"
              value={<pre className={styles.triggerJson}>{JSON.stringify(detail.trigger_data, null, 2)}</pre>}
            />
            <Field label="产生时间" value={dayjs(detail.created_at).format('YYYY-MM-DD HH:mm:ss')} />
            {detail.acknowledged_at && (
              <Field
                label="关注于"
                value={`${dayjs(detail.acknowledged_at).format('YYYY-MM-DD HH:mm')} · 操作人 ${detail.acknowledged_by ?? '—'}`}
              />
            )}
            {detail.resolved_at && (
              <Field label="解决于" value={dayjs(detail.resolved_at).format('YYYY-MM-DD HH:mm')} />
            )}
            {detail.note && <Field label="备注" value={detail.note} />}

            <div className={styles.drawerActions}>
              <Button
                size="small"
                type="primary"
                disabled={detail.status === 'resolved' || detail.status === 'false_positive'}
                onClick={() => {
                  const params = new URLSearchParams({
                    studentId: String(detail.student_id),
                    alertId: String(detail.id),
                  });
                  const ctx = detail.trigger_data?.explanation ?? detail.trigger_data?.rule_hit;
                  if (ctx) params.set('context', String(ctx));
                  navigate(`/counselor-talks?${params.toString()}`);
                }}
              >
                发起谈话
              </Button>
              <Button
                size="small"
                disabled={detail.status !== 'open'}
                onClick={() => {
                  setActionOpen({ id: detail.id, type: 'acknowledge' });
                  setActionNote('');
                }}
              >
                关注
              </Button>
              <Button
                size="small"
                disabled={detail.status === 'resolved' || detail.status === 'false_positive'}
                onClick={() => {
                  setActionOpen({ id: detail.id, type: 'resolve' });
                  setActionNote('');
                }}
              >
                解决
              </Button>
              <Tooltip title="规则不应触发此告警，计入误报统计">
                <Button
                  size="small"
                  danger
                  disabled={detail.status === 'resolved' || detail.status === 'false_positive'}
                  onClick={() => {
                    setActionOpen({ id: detail.id, type: 'false_positive' });
                    setActionNote('');
                  }}
                >
                  标记误报
                </Button>
              </Tooltip>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        title={actionOpen ? ACTION_LABEL[actionOpen.type] : ''}
        open={actionOpen !== null}
        onOk={handleAction}
        onCancel={() => {
          setActionOpen(null);
          setActionNote('');
        }}
        okText="确定"
        cancelText="取消"
        confirmLoading={ackMutation.isPending || resolveMutation.isPending || fpMutation.isPending}
      >
        <TextArea
          rows={4}
          maxLength={500}
          showCount
          placeholder="备注（选填）"
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
          style={{ marginTop: 12 }}
        />
      </Modal>
    </div>
  );
}

function AlertRulesTab() {
  const qc = useQueryClient();
  const [authorOpen, setAuthorOpen] = useState(false);
  const [aiEdit, setAiEdit] = useState<{ id: string; dsl: Record<string, unknown> } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDsl, setDraftDsl] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftSeverity, setDraftSeverity] = useState<AlertSeverity>('medium');
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const statsQuery = useQuery({
    queryKey: ['alertRuleStats', 30],
    queryFn: () => listAlertRuleStats(30),
  });

  const detailQuery = useQuery({
    queryKey: ['alertRuleDetail', detailId],
    queryFn: () => getAlertRule(detailId!),
    enabled: !!detailId,
  });

  useEffect(() => {
    if (editing && detailQuery.data && draftDsl === '') {
      const d = detailQuery.data;
      setDraftDsl(JSON.stringify(d.config, null, 2));
      setDraftName(d.name);
      setDraftDesc(d.description ?? '');
      setDraftSeverity(d.severity);
    }
  }, [editing, detailQuery.data, draftDsl]);

  const saveMut = useMutation({
    mutationFn: (body: Parameters<typeof patchAlertRule>[1] & { id: string }) => {
      const { id, ...rest } = body;
      return patchAlertRule(id, rest);
    },
    onSuccess: (r) => {
      if (r.ok) {
        message.success('已保存');
        setEditing(false);
        qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
        qc.invalidateQueries({ queryKey: ['alertRuleDetail', detailId] });
      } else {
        const msg = r.validation?.errors?.join('; ') || r.error_message || '保存失败';
        message.error(msg);
      }
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });

  const closeDrawer = () => {
    setDetailId(null);
    setEditing(false);
    setParseError(null);
    setDraftDsl('');
  };

  const startEdit = (d: AlertRuleDetail) => {
    setDraftDsl(JSON.stringify(d.config, null, 2));
    setDraftName(d.name);
    setDraftDesc(d.description ?? '');
    setDraftSeverity(d.severity);
    setParseError(null);
    setEditing(true);
  };

  const openEdit = (id: string) => {
    setDetailId(id);
    setEditing(true);
  };

  const openAiEdit = async (id: string) => {
    try {
      const d = await getAlertRule(id);
      setAiEdit({ id, dsl: d.config });
    } catch {
      message.error('加载规则详情失败');
    }
  };

  const handleSave = () => {
    if (!detail || !detailId) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draftDsl);
    } catch (e) {
      setParseError('JSON 解析失败：' + (e as Error).message);
      return;
    }
    setParseError(null);
    if (detail.rule_type === 'dsl') {
      saveMut.mutate({ id: detailId, dsl: parsed });
    } else {
      saveMut.mutate({
        id: detailId,
        name: draftName,
        description: draftDesc || null,
        severity: draftSeverity,
        config: parsed,
      });
    }
  };

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      patchAlertRule(id, { enabled }),
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAlertRule(id),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '删除失败')),
  });

  const targetIdsForBulk = () => {
    const rows = statsQuery.data ?? [];
    const ids = selectedIds.length > 0 ? selectedIds : rows.map((r) => r.id);
    return ids;
  };

  const handleExport = async () => {
    const ids = targetIdsForBulk();
    if (ids.length === 0) {
      message.warning('当前没有规则可导出');
      return;
    }
    setBusy(true);
    try {
      const details = await Promise.all(ids.map((id) => getAlertRule(id)));
      const payload = details.map((d) => ({
        name: d.name,
        description: d.description,
        rule_type: d.rule_type,
        severity: d.severity,
        enabled: d.enabled,
        config: d.config,
      }));
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alert-rules-${dayjs().format('YYYYMMDD-HHmmss')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`已导出 ${details.length} 条规则`);
    } catch {
      message.error('导出失败');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      setBusy(true);
      let ok = 0;
      let skip = 0;
      let fail = 0;
      for (const item of arr) {
        const o = item as { rule_type?: string; config?: Record<string, unknown> };
        if (o.rule_type && o.rule_type !== 'dsl') {
          skip += 1;
          continue;
        }
        const dsl = (o.config ?? o) as Record<string, unknown>;
        try {
          const r = await createAlertRule(dsl);
          if (r.ok) ok += 1;
          else fail += 1;
        } catch {
          fail += 1;
        }
      }
      qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
      message.success(`导入完成：成功 ${ok} 条，失败 ${fail} 条，跳过 ${skip} 条（非 DSL）`);
    } catch (e) {
      message.error('导入失败：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
    return false;
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      try {
        const r = await deleteAlertRule(id);
        if (r.ok) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
    qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
    setSelectedIds([]);
    setBusy(false);
    message.success(`批量删除完成：成功 ${ok} 条，失败 ${fail} 条`);
  };

  const columns: ColumnsType<AlertRuleStat> = [
    { title: '规则名', dataIndex: 'name', width: 160 },
    {
      title: '类型',
      dataIndex: 'rule_type',
      width: 90,
      render: (v: string) =>
        ({ frequency: '频次', composite: '复合', dsl: 'AI 规则' }[v] ?? v),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean, row) => (
        <Switch
          size="small"
          checked={v}
          loading={toggleMut.isPending && toggleMut.variables?.id === row.id}
          onChange={(checked) => toggleMut.mutate({ id: row.id, enabled: checked })}
        />
      ),
    },
    { title: '级别', dataIndex: 'severity', width: 80, render: renderSeverity },
    { title: '触发次数', dataIndex: 'fires', width: 100, sorter: (a, b) => a.fires - b.fires },
    { title: '已关注', dataIndex: 'acked', width: 90 },
    { title: '已解决', dataIndex: 'resolved', width: 90 },
    { title: '误报', dataIndex: 'false_positives', width: 80 },
    {
      title: '误报率',
      dataIndex: 'false_positive_rate',
      width: 100,
      sorter: (a, b) => a.false_positive_rate - b.false_positive_rate,
      render: (v: number) => {
        const pct = (v * 100).toFixed(1);
        const warn = v >= 0.3;
        return (
          <Tooltip title={warn ? '误报率偏高，建议调整规则' : ''}>
            <span style={{ color: warn ? '#cf1322' : undefined }}>{pct}%</span>
          </Tooltip>
        );
      },
    },
    {
      title: '平均响应(分)',
      dataIndex: 'avg_ack_minutes',
      width: 120,
      render: (v: number | null) => (v == null ? '—' : v.toFixed(0)),
    },
    {
      title: '最近触发',
      dataIndex: 'last_fired_at',
      width: 150,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      key: 'ops',
      width: 240,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            查看
          </Button>
          <Button size="small" type="link" onClick={() => openEdit(row.id)}>
            编辑
          </Button>
          <Button size="small" type="link" onClick={() => openAiEdit(row.id)}>
            AI 改
          </Button>
          <Popconfirm
            title="删除这条规则？"
            description="删除后将停止产生新告警，历史告警不受影响。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => deleteMut.mutate(row.id)}
          >
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detail = detailQuery.data;
  return (
    <div className={styles.tableCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <span style={{ color: 'var(--tx-2)', fontSize: 12 }}>
            {selectedIds.length > 0 ? `已选 ${selectedIds.length} 条` : '未选中，导出 / 删除将作用于全部'}
          </span>
        </Space>
        <Space>
          <Upload
            accept=".json"
            showUploadList={false}
            beforeUpload={(f) => {
              handleImport(f);
              return false;
            }}
            disabled={busy}
          >
            <Button icon={<UploadOutlined />} loading={busy}>
              导入
            </Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={busy}>
            导出{selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}
          </Button>
          <Popconfirm
            title={`删除选中的 ${selectedIds.length} 条规则？`}
            description="删除后将停止产生新告警，历史告警不受影响。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={selectedIds.length === 0}
            onConfirm={handleBulkDelete}
          >
            <Button
              icon={<DeleteOutlined />}
              danger
              disabled={selectedIds.length === 0 || busy}
            >
              批量删除
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => setAuthorOpen(true)}
          >
            AI 写规则
          </Button>
        </Space>
      </div>
      <Table<AlertRuleStat>
        rowKey="id"
        columns={columns}
        dataSource={statsQuery.data ?? []}
        loading={statsQuery.isFetching}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map(String)),
        }}
        pagination={{
          current: page,
          pageSize,
          total: statsQuery.data?.length ?? 0,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
          size: 'small',
        }}
        size="middle"
      />
      <AIRuleAuthorModal open={authorOpen} onClose={() => setAuthorOpen(false)} />
      <AIRuleAuthorModal
        open={!!aiEdit}
        onClose={() => setAiEdit(null)}
        mode="edit"
        editId={aiEdit?.id}
        initialDsl={aiEdit?.dsl ?? null}
      />
      <Drawer
        open={!!detailId}
        onClose={closeDrawer}
        title={detail ? detail.name : '规则详情'}
        width={640}
        destroyOnClose
        extra={
          detail && !editing ? (
            <Space>
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  setAiEdit({ id: detail.id, dsl: detail.config });
                }}
              >
                AI 改写
              </Button>
              <Button size="small" onClick={() => startEdit(detail)}>
                编辑
              </Button>
            </Space>
          ) : null
        }
      >
        {detailQuery.isLoading && <div>加载中…</div>}
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Field
              label="规则名"
              value={
                editing && detail.rule_type !== 'dsl' ? (
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                ) : (
                  detail.name
                )
              }
            />
            <Field
              label="描述"
              value={
                editing && detail.rule_type !== 'dsl' ? (
                  <Input.TextArea
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                  />
                ) : (
                  detail.description || '—'
                )
              }
            />
            <Field
              label="类型"
              value={
                { frequency: '频次', composite: '复合', dsl: 'AI 规则' }[detail.rule_type] ??
                detail.rule_type
              }
            />
            <Field
              label="级别"
              value={
                editing && detail.rule_type !== 'dsl' ? (
                  <Select
                    value={draftSeverity}
                    onChange={(v) => setDraftSeverity(v)}
                    style={{ width: 160 }}
                    options={[
                      { label: '低', value: 'low' },
                      { label: '中', value: 'medium' },
                      { label: '高', value: 'high' },
                      { label: '紧急', value: 'critical' },
                    ]}
                  />
                ) : (
                  renderSeverity(detail.severity)
                )
              }
            />
            <Field label="启用" value={detail.enabled ? '是' : '否'} />
            <Field
              label={
                editing
                  ? detail.rule_type === 'dsl'
                    ? 'DSL（可编辑 JSON，保存时后端会校验）'
                    : 'config（可编辑 JSON，直接替换）'
                  : 'DSL / config'
              }
              value={
                editing ? (
                  <Input.TextArea
                    value={draftDsl}
                    onChange={(e) => setDraftDsl(e.target.value)}
                    autoSize={{ minRows: 14, maxRows: 30 }}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                ) : (
                  <pre
                    style={{
                      background: 'var(--bg-2)',
                      padding: 12,
                      borderRadius: 4,
                      fontSize: 12,
                      lineHeight: 1.6,
                      maxHeight: 400,
                      overflow: 'auto',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(detail.config, null, 2)}
                  </pre>
                )
              }
            />
            {editing && parseError && (
              <div style={{ color: '#cf1322', fontSize: 12 }}>{parseError}</div>
            )}
            {editing && (
              <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button
                  onClick={() => {
                    setEditing(false);
                    setParseError(null);
                  }}
                >
                  取消
                </Button>
                <Button type="primary" loading={saveMut.isPending} onClick={handleSave}>
                  保存
                </Button>
              </Space>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}
