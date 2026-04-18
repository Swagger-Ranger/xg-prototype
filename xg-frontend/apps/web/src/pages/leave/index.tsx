import { useState, useEffect } from 'react';
import { Table, Tag, Select, Button, DatePicker, Segmented, message, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveRequest, LeaveTypeConfig } from '@xg1/shared';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_COLORS } from '@xg1/shared';
import type { LeaveQueryParams } from '@/api/leave';
import {
  getMyLeaves,
  withdrawLeave,
  cancelLeave,
  getClassLeaves,
  getUncancelledLeaves,
  getLeaveTypes,
  confirmCancelLeave,
  forceCancelLeave,
  getLeaveStats,
} from '@/api/leave';
import { useAuth } from '@/hooks/useAuth';
import { useAIActionStore } from '@/stores/ai-action.store';
import LeaveApplyModal from './LeaveApplyModal';
import LeaveDetailDrawer from './LeaveDetailDrawer';
import styles from './index.module.css';

const { RangePicker } = DatePicker;

type TabKey = 'all' | 'uncancelled' | 'stats';

interface LeaveStatsByType {
  leave_type_code: string;
  leave_type_name: string;
  count: number;
}
interface LeaveStats {
  total_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  cancelled_count: number;
  avg_duration_days: number;
  by_type: LeaveStatsByType[];
}

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '审批中', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已撤销', value: 'cancelled' },
  { label: '销假审批中', value: 'cancel_pending' },
];

export default function LeaveManagement() {
  const { isStudent } = useAuth();
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDates, setFilterDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPrefill, setApplyPrefill] = useState<Record<string, unknown> | undefined>();
  const [detailRecord, setDetailRecord] = useState<LeaveRequest | null>(null);

  const aiAction = useAIActionStore((s) => s.action);
  const consumeAction = useAIActionStore((s) => s.consume);
  const setContext = useAIActionStore((s) => s.setContext);

  // Report page context to AI
  useEffect(() => {
    setContext({ page: 'leave', modal: applyOpen ? 'leave_apply' : undefined });
  }, [applyOpen, setContext]);

  useEffect(() => {
    if (!aiAction) return;
    if (aiAction.type === 'open_leave_form') {
      setApplyPrefill(aiAction.data ?? undefined);
      setApplyOpen(true);
      consumeAction();
    } else if (aiAction.type === 'submit_leave_directly') {
      // AI wants to submit directly — open the form with prefill and auto-submit flag
      setApplyPrefill({ ...aiAction.data, _autoSubmit: true });
      setApplyOpen(true);
      consumeAction();
    }
  }, [aiAction, consumeAction]);

  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;

  const queryParams: LeaveQueryParams = {
    page,
    size: PAGE_SIZE,
    status: filterStatus || undefined,
    leave_type_code: filterType || undefined,
    start_date: filterDates?.[0]?.format('YYYY-MM-DD'),
    end_date: filterDates?.[1]?.format('YYYY-MM-DD'),
  };

  const studentQueryParams: LeaveQueryParams = { page, size: PAGE_SIZE };

  const { data: myLeavesData, isFetching: myLeavesFetching } = useQuery({
    queryKey: ['myLeaves', studentQueryParams],
    queryFn: () => getMyLeaves(studentQueryParams),
    enabled: isStudent,
  });

  const { data: allData, isFetching: allFetching } = useQuery({
    queryKey: ['classLeaves', queryParams],
    queryFn: () => getClassLeaves(queryParams),
    enabled: !isStudent && tab === 'all',
  });

  const { data: uncancelledData, isFetching: uncancelledFetching } = useQuery({
    queryKey: ['uncancelledLeaves', queryParams],
    queryFn: () => getUncancelledLeaves(queryParams),
    enabled: !isStudent && tab === 'uncancelled',
  });

  const statsQueryParams = {
    leave_type_code: filterType || undefined,
    start_date: filterDates?.[0]?.format('YYYY-MM-DD'),
    end_date: filterDates?.[1]?.format('YYYY-MM-DD'),
  };

  const { data: statsData, isFetching: statsFetching } = useQuery<LeaveStats>({
    queryKey: ['leaveStats', statsQueryParams],
    queryFn: () => getLeaveStats(statsQueryParams) as Promise<LeaveStats>,
    enabled: tab === 'stats',
  });

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
  });

  const confirmMutation = useMutation({
    mutationFn: confirmCancelLeave,
    onSuccess: () => {
      message.success('销假确认成功');
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    },
    onError: () => {
      message.error('确认销假失败，请重试');
    },
  });

  const forceMutation = useMutation({
    mutationFn: forceCancelLeave,
    onSuccess: () => {
      message.success('强制销假成功');
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
    },
    onError: () => {
      message.error('强制销假失败，请重试');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawLeave,
    onSuccess: () => {
      message.success('撤回成功');
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    },
    onError: () => {
      message.error('撤回失败，请重试');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelLeave,
    onSuccess: () => {
      message.success('销假申请已提交');
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
    },
    onError: () => {
      message.error('销假申请失败，请重试');
    },
  });

  const handleTabChange = (val: string | number) => {
    setTab(val as TabKey);
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
    queryClient.invalidateQueries({ queryKey: ['uncancelledLeaves'] });
  };

  const currentData = isStudent
    ? myLeavesData
    : tab === 'uncancelled' ? uncancelledData : allData;
  const isLoading = isStudent
    ? myLeavesFetching
    : tab === 'uncancelled' ? uncancelledFetching : allFetching;

  const studentColumns: ColumnsType<LeaveRequest> = [
    {
      title: '假别',
      dataIndex: 'leave_type_name',
      width: 100,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD'),
    },
    {
      title: '天数',
      dataIndex: 'duration_days',
      width: 70,
      render: (v: number) => `${v}天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const color = LEAVE_STATUS_COLORS[status as keyof typeof LEAVE_STATUS_COLORS];
        const label = LEAVE_STATUS_LABELS[status as keyof typeof LEAVE_STATUS_LABELS];
        return (
          <Tag
            className={styles.statusTag}
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {label}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <span>
          <button
            className={styles.actionLink}
            onClick={() => setDetailRecord(record)}
          >
            查看
          </button>
          {record.status === 'pending' && (
            <button
              className={`${styles.actionLink} ${styles.warn}`}
              onClick={() => Modal.confirm({
                title: '确认撤回',
                content: '确定要撤回该请假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => withdrawMutation.mutate(record.id),
              })}
            >
              撤回
            </button>
          )}
          {record.status === 'approved' && (
            <button
              className={`${styles.actionLink} ${styles.danger}`}
              onClick={() => Modal.confirm({
                title: '确认销假',
                content: '确定要提交销假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => cancelMutation.mutate(record.id),
              })}
            >
              销假
            </button>
          )}
        </span>
      ),
    },
  ];

  const columns: ColumnsType<LeaveRequest> = [
    {
      title: '学生姓名',
      dataIndex: 'student_name',
      width: 100,
    },
    {
      title: '假别',
      dataIndex: 'leave_type_name',
      width: 100,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 110,
      render: (v: string) => dayjs(v).format('MM-DD'),
    },
    {
      title: '天数',
      dataIndex: 'duration_days',
      width: 70,
      render: (v: number) => `${v}天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const color = LEAVE_STATUS_COLORS[status as keyof typeof LEAVE_STATUS_COLORS];
        const label = LEAVE_STATUS_LABELS[status as keyof typeof LEAVE_STATUS_LABELS];
        return (
          <Tag
            className={styles.statusTag}
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {label}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <span>
          <button
            className={styles.actionLink}
            onClick={() => setDetailRecord(record)}
          >
            查看
          </button>
          {record.status === 'cancel_pending' && (
            <button
              className={`${styles.actionLink} ${styles.warn}`}
              onClick={() => Modal.confirm({
                title: '确认销假',
                content: '确定要确认该学生的销假申请吗？',
                okText: '确定',
                cancelText: '取消',
                onOk: () => confirmMutation.mutate(record.id),
              })}
            >
              确认销假
            </button>
          )}
          {record.status === 'approved' && (
            <button
              className={`${styles.actionLink} ${styles.danger}`}
              onClick={() => Modal.confirm({
                title: '确认强制销假',
                content: '确定要强制销假吗？此操作不可撤销。',
                okText: '确定',
                cancelText: '取消',
                onOk: () => forceMutation.mutate(record.id),
              })}
            >
              强制销假
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{isStudent ? '我的请假' : '请销假管理'}</h1>
        {isStudent && (
          <Button type="primary" onClick={() => setApplyOpen(true)}>
            申请请假
          </Button>
        )}
      </div>

      <Segmented
        className={styles.segmented}
        options={isStudent
          ? [
              { label: '我的请假', value: 'all' },
              { label: '统计', value: 'stats' },
            ]
          : [
              { label: '全部请假', value: 'all' },
              { label: '未销假', value: 'uncancelled' },
              { label: '统计', value: 'stats' },
            ]
        }
        value={tab}
        onChange={handleTabChange}
      />

      {tab === 'stats' ? (
        <div className={styles.statsSection}>
          {statsFetching ? (
            <div className={styles.statsLoading}>加载中...</div>
          ) : statsData ? (
            <>
              <div className={styles.statsGrid}>
                <div className={styles.statsCard}>
                  <div className={styles.statsCardValue}>{statsData.total_count}</div>
                  <div className={styles.statsCardLabel}>请假总数</div>
                </div>
                <div className={styles.statsCard}>
                  <div className={`${styles.statsCardValue} ${styles.warn}`}>{statsData.pending_count}</div>
                  <div className={styles.statsCardLabel}>审批中</div>
                </div>
                <div className={styles.statsCard}>
                  <div className={`${styles.statsCardValue} ${styles.ok}`}>{statsData.approved_count}</div>
                  <div className={styles.statsCardLabel}>已通过</div>
                </div>
                <div className={styles.statsCard}>
                  <div className={`${styles.statsCardValue} ${styles.danger}`}>{statsData.rejected_count}</div>
                  <div className={styles.statsCardLabel}>已驳回</div>
                </div>
              </div>
              {statsData.by_type?.length > 0 && (
                <div className={styles.statsTableCard}>
                  <div className={styles.statsTableTitle}>按假别统计</div>
                  <table className={styles.statsTable}>
                    <thead>
                      <tr>
                        <th>假别</th>
                        <th>数量</th>
                        <th>占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsData.by_type.map((row) => {
                        const pct = statsData.total_count > 0
                          ? Math.round((row.count / statsData.total_count) * 100)
                          : 0;
                        return (
                          <tr key={row.leave_type_code}>
                            <td>{row.leave_type_name}</td>
                            <td>{row.count}</td>
                            <td>
                              <div className={styles.pctBar}>
                                <div className={styles.pctFill} style={{ width: `${pct}%` }} />
                                <span className={styles.pctLabel}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className={styles.statsEmpty}>暂无数据</div>
          )}
        </div>
      ) : (
        <>
          {!isStudent && <div className={styles.filterBar}>
            <Select
              style={{ width: 130 }}
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_OPTIONS}
            />
            <Select
              style={{ width: 130 }}
              placeholder="全部假别"
              allowClear
              value={filterType || undefined}
              onChange={(v) => setFilterType(v ?? '')}
              options={leaveTypes.map((t) => ({ label: t.name, value: t.code }))}
            />
            <RangePicker
              format="YYYY-MM-DD"
              value={filterDates}
              onChange={(v) => setFilterDates(v as [Dayjs | null, Dayjs | null] | null)}
            />
            <Button type="primary" onClick={handleSearch}>
              查询
            </Button>
            <Button
              onClick={() => {
                setFilterStatus('');
                setFilterType('');
                setFilterDates(null);
                setPage(1);
              }}
            >
              重置
            </Button>
          </div>}

          <div className={styles.tableCard}>
            <Table<LeaveRequest>
              rowKey="id"
              columns={isStudent ? studentColumns : columns}
              dataSource={currentData?.data ?? []}
              loading={isLoading}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total: currentData?.total ?? 0,
                onChange: setPage,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
                size: 'small',
              }}
              size="middle"
            />
          </div>
        </>
      )}

      <LeaveApplyModal open={applyOpen} onClose={() => { setApplyOpen(false); setApplyPrefill(undefined); }} prefill={applyPrefill} />
      <LeaveDetailDrawer record={detailRecord} onClose={() => setDetailRecord(null)} />
    </div>
  );
}
