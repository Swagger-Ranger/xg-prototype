import { useState } from 'react';
import { Table, Tag, Select, Input, Drawer, Descriptions } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import type { Student, StudentQueryParams } from '@/api/student';
import { getStudents, getStudent } from '@/api/student';
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

const PAGE_SIZE = 20;

export default function StudentManagement() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const queryParams: StudentQueryParams = {
    page,
    size: PAGE_SIZE,
    keyword: keyword || undefined,
    grade: filterGrade || undefined,
    status: filterStatus || undefined,
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
  };

  const handleSearch = (val: string) => {
    setKeyword(val);
    setPage(1);
  };

  const columns: ColumnsType<Student> = [
    {
      title: '学号',
      dataIndex: 'student_id',
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
    },
    {
      title: '年级',
      dataIndex: 'grade',
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
      width: 80,
      render: (_, record) => (
        <button
          className={styles.actionLink}
          onClick={() => handleView(record.id)}
        >
          查看
        </button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>学生信息</h1>
      </div>

      <div className={styles.filterBar}>
        <Input.Search
          placeholder="搜索学号、姓名"
          allowClear
          style={{ width: 200 }}
          onSearch={handleSearch}
          onChange={(e) => {
            if (!e.target.value) {
              setKeyword('');
              setPage(1);
            }
          }}
        />
        <Select
          style={{ width: 120 }}
          value={filterGrade}
          onChange={(v) => { setFilterGrade(v); setPage(1); }}
          options={GRADE_OPTIONS}
        />
        <Select
          style={{ width: 120 }}
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
      </div>

      <div className={styles.tableCard}>
        <Table<Student>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
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
      >
        {detailData && (
          <div className={styles.drawerBody}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="学号">{detailData.student_id}</Descriptions.Item>
              <Descriptions.Item label="姓名">{detailData.name}</Descriptions.Item>
              <Descriptions.Item label="性别">{detailData.gender}</Descriptions.Item>
              <Descriptions.Item label="年级">{detailData.grade}</Descriptions.Item>
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
          </div>
        )}
      </Drawer>
    </div>
  );
}
