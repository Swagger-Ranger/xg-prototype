import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Modal, Select, Table, Tag, Drawer, Descriptions, Tabs, Button } from 'antd';
import { message } from '@/utils/antdApp';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Student, StudentQueryParams } from '@/api/student';
import {
  getStudents,
  getStudent,
  getResidentialClasses,
  updateResidentialClass,
} from '@/api/student';
import { describeApiError } from '@/utils/api-error';
import { getTenantSettings } from '@/api/tenantSettings';
import { getFieldCatalog } from '@/api/fieldCatalog';
import { useStudentFilters } from '@/hooks/useStudentFilters';
import DynamicFilterBar from '@/components/filters/DynamicFilterBar';
import EventTimeline from '@/components/student/EventTimeline';
import PinToAIButton from '@/components/ai/PinToAIButton';
import AskAIChip from '@/components/ai/AskAIChip';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

// 注:Filter 选项 (年级/学院/专业/性别/状态等) 已经迁到 field-catalog/student.yaml,
// 由 <DynamicFilterBar> 渲染。这里只保留表格展示用得到的两份映射 — Tag 渲染需要静态颜色。
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
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function StudentManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const initialTab = searchParams.get('tab') === 'timeline' ? 'timeline' : 'profile';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [pulseKey, setPulseKey] = useState(0);
  const pulsingIdsRef = useRef<Set<string>>(new Set());
  const pulseTimerRef = useRef<number | null>(null);

  const highlightTs = useAIActionStore((s) => s.highlight?.timestamp ?? 0);
  const highlightItems = useAIActionStore((s) => s.highlight?.items);
  const hoveredRef = useAIActionStore((s) => s.hoveredRef);
  const aiAction = useAIActionStore((s) => s.action);
  const consumeAiAction = useAIActionStore((s) => s.consume);

  // AI → student page: apply filter conditions emitted by the filter_students tool.
  // applyAll 直接整批替换 (catalog 里有的字段全部覆盖 + 不在 catalog 的丢掉),
  // 所以 LLM 多发 / 少发字段都安全。key 必须和 yaml 一致 (camelCase: className/dormBlock)。
  useEffect(() => {
    if (!aiAction || aiAction.type !== 'filter_students') return;
    filters.applyAll(aiAction.data ?? {});
    consumeAiAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters 是 hook 实例,引用稳定
  }, [aiAction, consumeAiAction]);

  // AI → right panel: pulse rows the AI just talked about.
  // Depend on timestamp (not the object) so cleanup only runs on a new signal.
  useEffect(() => {
    if (!highlightTs || !highlightItems) return;
    const ids = highlightItems.filter((h) => h.type === 'student').map((h) => h.id);
    if (ids.length === 0) return;
    ids.forEach((id) => pulsingIdsRef.current.add(id));
    setPulseKey((k) => k + 1);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      ids.forEach((id) => pulsingIdsRef.current.delete(id));
      setPulseKey((k) => k + 1);
      pulseTimerRef.current = null;
    }, 2000);
  }, [highlightTs, highlightItems]);

  useEffect(() => () => {
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
  }, []);

  useEffect(() => {
    const sid = searchParams.get('studentId');
    if (sid && sid !== detailId) {
      setDetailId(sid);
      setDrawerOpen(true);
      setActiveTab(searchParams.get('tab') === 'timeline' ? 'timeline' : 'profile');
    }
  }, [searchParams, detailId]);

  // 租户配置:书院制 toggle。失败 fallback 单轨视图,不阻塞页面渲染。
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenantSettings'],
    queryFn: getTenantSettings,
    retry: false,
  });
  const enableResidential = tenantSettings?.enable_residential_track ?? false;

  // 字段目录:filter 行长什么样、选项从哪来,全在这份 yaml。
  const { data: catalog } = useQuery({
    queryKey: ['fieldCatalog', 'student'],
    queryFn: () => getFieldCatalog('student'),
    staleTime: 5 * 60 * 1000,
  });

  // useStudentFilters 接管 9 个独立 useState,内部包级联清空 + 租户门控 + applyAll(给 AI 用)。
  // 任何 set/clear 触发 onAfterChange → 自动回到第 1 页。
  const filters = useStudentFilters(catalog, tenantSettings, () => setPage(1));

  // 后端 query 参数:pagination + catalog 驱动的 filter 值。yaml 加新字段 → 这里自动跟着传。
  const queryParams = useMemo(
    () => ({ page, size: pageSize, ...filters.values }) as unknown as StudentQueryParams,
    [page, pageSize, filters.values],
  );

  // 已选 chip 条:遍历 catalog 把当前有值的字段渲成"标签: 值"。
  // 每行的 onRemove 走 filters.clearOne (它会自动级联清子级,e.g. 清学院 → 专业/班级也清)。
  const activeFilters = useMemo(() => {
    if (!catalog) return [] as { key: string; label: string; onRemove: () => void }[];
    return catalog.fields
      .filter((f) => filters.values[f.key])
      .map((f) => {
        const value = filters.values[f.key];
        // 静态枚举:用 option.label 而不是 value (避免显示 active/male 这种英文 code)
        let displayValue = value;
        const opt = f.options?.find((o) => o.value === value);
        if (opt) displayValue = opt.label;
        const heading = f.key === 'keyword' ? '关键字' : f.label;
        return {
          key: f.key,
          label: `${heading}: ${displayValue}`,
          onRemove: () => filters.clearOne(f.key),
        };
      });
  }, [catalog, filters]);

  const resetAllFilters = () => filters.clearAll();

  const { data, isFetching } = useQuery({
    queryKey: ['students', queryParams],
    queryFn: () => getStudents(queryParams),
  });

  const { data: detailData, isFetching: detailFetching } = useQuery({
    queryKey: ['student', detailId],
    queryFn: () => getStudent(detailId!),
    enabled: !!detailId,
  });

  const handleView = (id: string) => {
    setDetailId(id);
    setDrawerOpen(true);
  };

  // ── 改书院班 modal ───────────────────────────────────────────
  // toggle 关闭时永远不打开;打开时按当前书院班名字反查 id 作初始值。
  const qc = useQueryClient();
  const [resEditTarget, setResEditTarget] = useState<Student | null>(null);
  const [resEditValue, setResEditValue] = useState<number | null>(null);
  const { data: residentialClasses } = useQuery({
    queryKey: ['residentialClasses'],
    queryFn: getResidentialClasses,
    enabled: enableResidential,
    staleTime: 60_000,
  });
  const openResEdit = (record: Student) => {
    const matched = residentialClasses?.find(
      (c) => c.name === record.residential_dorm_block,
    );
    setResEditValue(matched?.id ?? null);
    setResEditTarget(record);
  };
  const resEditMut = useMutation({
    mutationFn: ({ id, orgUnitId }: { id: string; orgUnitId: number | null }) =>
      updateResidentialClass(id, orgUnitId),
    onSuccess: () => {
      message.success('已更新书院班');
      qc.invalidateQueries({ queryKey: ['students'] });
      setResEditTarget(null);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败')),
  });

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setDetailId(null);
    if (searchParams.has('studentId') || searchParams.has('tab')) {
      const next = new URLSearchParams(searchParams);
      next.delete('studentId');
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  };

  const columns: ColumnsType<Student> = [
    {
      title: '学号',
      dataIndex: 'student_no',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 90,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 70,
      render: (v: string) => (v === 'male' ? '男' : v === 'female' ? '女' : v || '-'),
    },
    {
      title: '年级',
      dataIndex: 'grade',
      width: 90,
    },
    {
      title: '培养层次',
      dataIndex: 'education_level',
      width: 90,
    },
    {
      title: '学院',
      dataIndex: 'college',
      width: 140,
    },
    {
      title: '专业',
      dataIndex: 'major',
      width: 140,
    },
    {
      title: '班级',
      dataIndex: 'class_name',
      width: 100,
    },
    // 双轨制:启用书院制时插入"书院 / 书院班"两列;否则不出现,跟单轨学校 UI 完全一致。
    // dataIndex 沿用 residential_dorm_block(技术名,DB 列也叫 dorm_block);用户标签是"书院班"。
    ...(enableResidential ? [
      {
        title: '书院',
        dataIndex: 'residential_academy' as const,
        width: 120,
        render: (v: string | null | undefined) => v || <span style={{ color: 'var(--fg-4)' }}>—</span>,
      },
      {
        title: '书院班',
        dataIndex: 'residential_dorm_block' as const,
        width: 100,
        render: (v: string | null | undefined) => v || <span style={{ color: 'var(--fg-4)' }}>—</span>,
      },
    ] : []),
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => {
        const color = STATUS_COLORS[status] ?? 'var(--fg-3)';
        const label = STATUS_LABELS[status] ?? status;
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
      width: enableResidential ? 220 : 160,
      render: (_, record) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            className={styles.actionLink}
            onClick={() => handleView(record.id)}
          >
            查看
          </button>
          <button
            className={styles.actionLink}
            onClick={() => navigate(`/student/${record.id}`)}
          >
            画像
          </button>
          {enableResidential && (
            <button
              className={styles.actionLink}
              onClick={() => openResEdit(record)}
            >
              改书院班
            </button>
          )}
          <PinToAIButton
            refData={{
              type: 'student',
              id: String(record.id),
              label: record.name,
              detail: `${record.student_no ?? ''} · ${record.grade ?? ''} · ${record.class_name ?? ''}`.trim(),
            }}
          />
          <AskAIChip
            refData={{
              type: 'student',
              id: String(record.id),
              label: record.name,
              detail: `${record.student_no ?? ''} · ${record.grade ?? ''} · ${record.class_name ?? ''}`.trim(),
            }}
            prompt="请结合 {label} 最近 30 天的考勤、请假、违纪情况，分析是否有风险并给出建议。"
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>学生信息库</h1>
        <Button onClick={() => navigate('/student/fields')}>字段管理</Button>
      </div>

      <div className={styles.filterCard}>
        <div className={styles.filterAiHint}>
          <RobotOutlined />
          <span>
            也可以在小夕里用自然语言过滤，例如「过滤 2024级 人工智能专业的学生」。
          </span>
        </div>
        {/* 过滤行全部由 yaml 字段目录驱动:加新字段就改 yaml,不动 React。
            UI 仍走 styles.filterRow / styles.chip,字距颜色和原版一致。 */}
        {catalog && (
          <DynamicFilterBar
            catalog={catalog}
            values={filters.values}
            onChange={filters.set}
            tenantSettings={tenantSettings}
          />
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className={styles.activeBar}>
          <span className={styles.activeBarLabel}>已选</span>
          <div className={styles.activeBarValues}>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={styles.activeChip}
                onClick={f.onRemove}
              >
                <span>{f.label}</span>
                <CloseOutlined className={styles.activeChipClose} />
              </button>
            ))}
            <button
              type="button"
              className={styles.activeBarClear}
              onClick={resetAllFilters}
            >
              清空全部
            </button>
          </div>
        </div>
      )}

      <div className={styles.tableCard}>
        <Table<Student>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isFetching}
          rowClassName={(record) => {
            const id = String(record.id);
            const classes: string[] = [];
            if (pulsingIdsRef.current.has(id)) classes.push(`${styles.pulseRow} pulse-${pulseKey}`);
            if (hoveredRef?.type === 'student' && hoveredRef.id === id) classes.push(styles.hoveredRow);
            return classes.join(' ');
          }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            onChange: (p, ps) => { setPage(p); if (ps !== pageSize) setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS.map(String),
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      <Drawer
        title="学生详情"
        width={480}
        open={drawerOpen}
        onClose={handleDrawerClose}
        loading={detailFetching}
        extra={detailId ? (
          <Button type="primary" size="small" onClick={() => navigate(`/student/${detailId}`)}>
            打开完整画像
          </Button>
        ) : null}
      >
        {detailData && (
          <Tabs
            className={styles.drawerBody}
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'profile',
                label: '资料',
                children: (
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="学号">{detailData.student_no}</Descriptions.Item>
                    <Descriptions.Item label="姓名">{detailData.name}</Descriptions.Item>
                    <Descriptions.Item label="性别">
                      {detailData.gender === 'male' ? '男' : detailData.gender === 'female' ? '女' : detailData.gender || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="年级">{detailData.grade}</Descriptions.Item>
                    <Descriptions.Item label="培养层次">{detailData.education_level}</Descriptions.Item>
                    <Descriptions.Item label="学院">{detailData.college}</Descriptions.Item>
                    <Descriptions.Item label="专业">{detailData.major}</Descriptions.Item>
                    <Descriptions.Item label="班级">{detailData.class_name}</Descriptions.Item>
                    <Descriptions.Item label="手机号">{detailData.phone}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{detailData.email}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      {(() => {
                        const color = STATUS_COLORS[detailData.status] ?? 'var(--fg-3)';
                        const label = STATUS_LABELS[detailData.status] ?? detailData.status;
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
                      })()}
                    </Descriptions.Item>
                    <Descriptions.Item label="入学日期">{detailData.enrollment_date}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{detailData.created_at}</Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'timeline',
                label: '行为时间线',
                children: <EventTimeline studentId={detailData.user_id} />,
              },
            ]}
          />
        )}
      </Drawer>

      <Modal
        title={resEditTarget ? `改书院班 — ${resEditTarget.name}` : '改书院班'}
        open={!!resEditTarget}
        onCancel={() => setResEditTarget(null)}
        confirmLoading={resEditMut.isPending}
        okText="保存"
        cancelText="取消"
        onOk={() =>
          resEditTarget &&
          resEditMut.mutate({ id: resEditTarget.id, orgUnitId: resEditValue })
        }
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>
            当前:{resEditTarget?.residential_dorm_block || '未分配'}
          </div>
          <Select
            allowClear
            placeholder="选择新的书院班(留空 = 取消归属)"
            value={resEditValue ?? undefined}
            onChange={(v) => setResEditValue(v ?? null)}
            options={(residentialClasses ?? []).map((c) => ({
              value: c.id,
              label: c.academy_name ? `${c.academy_name} / ${c.name}` : c.name,
            }))}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
          />
        </div>
      </Modal>
    </div>
  );
}

