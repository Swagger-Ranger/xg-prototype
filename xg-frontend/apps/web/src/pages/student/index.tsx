import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Table, Tag, Input, Drawer, Descriptions, Tabs, Button } from 'antd';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import type { Student, StudentQueryParams } from '@/api/student';
import { getStudents, getStudent, getStudentClasses } from '@/api/student';
import EventTimeline from '@/components/student/EventTimeline';
import PinToAIButton from '@/components/ai/PinToAIButton';
import AskAIChip from '@/components/ai/AskAIChip';
import { useAIActionStore } from '@/stores/ai-action.store';
import styles from './index.module.css';

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

const GRADE_OPTIONS = [
  { label: '全部年级', value: '' },
  { label: '2021级', value: '2021级' },
  { label: '2022级', value: '2022级' },
  { label: '2023级', value: '2023级' },
  { label: '2024级', value: '2024级' },
  { label: '2025级', value: '2025级' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '在读', value: 'active' },
  { label: '休学', value: 'suspended' },
  { label: '毕业', value: 'graduated' },
  { label: '退学', value: 'withdrawn' },
];

// Hardcoded college → majors. student_profile stores college/major as free text,
// so this list is curated to match the seed data rather than loaded from org_unit.
const COLLEGE_MAJORS: Record<string, string[]> = {
  计算机学院: ['软件工程', '计算机科学与技术', '数据科学与大数据技术', '人工智能'],
  人文学院: ['汉语言文学', '新闻学', '历史学', '哲学'],
  经济管理学院: ['工商管理', '会计学', '金融学', '国际经济与贸易'],
  机械工程学院: ['机械设计制造及其自动化', '自动化'],
  艺术学院: ['视觉传达设计', '音乐表演'],
};
const COLLEGE_OPTIONS = [
  { label: '全部学院', value: '' },
  ...Object.keys(COLLEGE_MAJORS).map((c) => ({ label: c, value: c })),
];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function StudentManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCollege, setFilterCollege] = useState('');
  const [filterMajor, setFilterMajor] = useState('');
  const [filterClass, setFilterClass] = useState('');
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

  // AI → student page: apply filter conditions emitted by the filter_students
  // tool (e.g. user said "过滤 2024级 人工智能专业的学生" in the side panel).
  useEffect(() => {
    if (!aiAction || aiAction.type !== 'filter_students') return;
    const d = aiAction.data ?? {};
    const get = (k: string): string => {
      const v = d[k];
      return typeof v === 'string' ? v : '';
    };
    setKeyword(get('keyword'));
    setFilterGrade(get('grade'));
    setFilterCollege(get('college'));
    setFilterMajor(get('major'));
    setFilterClass(get('class_name'));
    setFilterStatus(get('status'));
    setPage(1);
    consumeAiAction();
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

  const queryParams: StudentQueryParams = {
    page,
    size: pageSize,
    keyword: keyword || undefined,
    grade: filterGrade || undefined,
    status: filterStatus || undefined,
    college: filterCollege || undefined,
    major: filterMajor || undefined,
    className: filterClass || undefined,
  };

  const majorOptions = useMemo(() => {
    const majors = filterCollege
      ? COLLEGE_MAJORS[filterCollege] ?? []
      : Array.from(new Set(Object.values(COLLEGE_MAJORS).flat()));
    return [{ label: '全部专业', value: '' }, ...majors.map((m) => ({ label: m, value: m }))];
  }, [filterCollege]);

  const { data: classNames = [] } = useQuery<string[]>({
    queryKey: ['studentClasses', filterCollege, filterMajor],
    queryFn: () =>
      getStudentClasses({
        college: filterCollege || undefined,
        major: filterMajor || undefined,
      }),
    enabled: !!filterMajor,
    staleTime: 60 * 1000,
  });
  const classOptions = useMemo(
    () => [{ label: '全部班级', value: '' }, ...classNames.map((c) => ({ label: c, value: c }))],
    [classNames],
  );

  const activeFilters = [
    keyword && { key: 'keyword', label: `关键字: ${keyword}`, onRemove: () => { setKeyword(''); setPage(1); } },
    filterGrade && { key: 'grade', label: `年级: ${filterGrade}`, onRemove: () => { setFilterGrade(''); setPage(1); } },
    filterCollege && { key: 'college', label: `学院: ${filterCollege}`, onRemove: () => { setFilterCollege(''); setFilterMajor(''); setFilterClass(''); setPage(1); } },
    filterMajor && { key: 'major', label: `专业: ${filterMajor}`, onRemove: () => { setFilterMajor(''); setFilterClass(''); setPage(1); } },
    filterClass && { key: 'class', label: `班级: ${filterClass}`, onRemove: () => { setFilterClass(''); setPage(1); } },
    filterStatus && { key: 'status', label: `状态: ${STATUS_LABELS[filterStatus] ?? filterStatus}`, onRemove: () => { setFilterStatus(''); setPage(1); } },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  const resetAllFilters = () => {
    setKeyword('');
    setFilterGrade('');
    setFilterStatus('');
    setFilterCollege('');
    setFilterMajor('');
    setFilterClass('');
    setPage(1);
  };

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

  const handleSearch = (val: string) => {
    setKeyword(val);
    setPage(1);
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
      width: 160,
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
        <FilterRow label="搜索">
          <Input.Search
            placeholder="学号或姓名"
            allowClear
            style={{ width: 240 }}
            onSearch={handleSearch}
            onChange={(e) => {
              if (!e.target.value) {
                setKeyword('');
                setPage(1);
              }
            }}
          />
        </FilterRow>
        <FilterRow label="年级">
          {GRADE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value || 'all'}
              active={filterGrade === opt.value}
              onClick={() => { setFilterGrade(opt.value); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="学院">
          {COLLEGE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value || 'all'}
              active={filterCollege === opt.value}
              onClick={() => { setFilterCollege(opt.value); setFilterMajor(''); setFilterClass(''); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="专业">
          {majorOptions.map((opt) => (
            <Chip
              key={opt.value || 'all'}
              active={filterMajor === opt.value}
              onClick={() => { setFilterMajor(opt.value); setFilterClass(''); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterRow>
        {filterMajor && (
          <FilterRow label="班级">
            {classOptions.map((opt) => (
              <Chip
                key={opt.value || 'all'}
                active={filterClass === opt.value}
                onClick={() => { setFilterClass(opt.value); setPage(1); }}
              >
                {opt.label}
              </Chip>
            ))}
          </FilterRow>
        )}
        <FilterRow label="状态">
          {STATUS_OPTIONS.map((opt) => (
            <Chip
              key={opt.value || 'all'}
              active={filterStatus === opt.value}
              onClick={() => { setFilterStatus(opt.value); setPage(1); }}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterRow>
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
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.filterRow}>
      <span className={styles.filterRowLabel}>{label}</span>
      <div className={styles.filterRowValues}>{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
