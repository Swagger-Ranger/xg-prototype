import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ClassSchedule,
  type ClassScheduleEntry,
  deleteSchedule,
  getCurrentTerm,
  listClasses,
  listSchedules,
  listTerms,
  triggerScheduleSync,
  upsertSchedule,
} from '@/api/academic';
import { describeApiError } from '@/utils/api-error';

const SAMPLE_ENTRIES: ClassScheduleEntry[] = [
  {
    course_name: '示例课程',
    teacher: '张教授',
    location: '教 101',
    day_of_week: 1,
    start_period: 1,
    end_period: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    color: '#6366f1',
  },
];

export default function SchedulesSection() {
  const qc = useQueryClient();
  const [filterClassId, setFilterClassId] = useState<string | null>(null);
  const [filterTermCode, setFilterTermCode] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSchedule | null>(null);
  const [form] = Form.useForm<{ class_id: string; term_code: string; entries: string }>();

  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: listClasses });
  const { data: terms = [] } = useQuery({ queryKey: ['academicTerms'], queryFn: listTerms });
  const { data: currentTerm } = useQuery({ queryKey: ['currentTerm'], queryFn: getCurrentTerm });

  // Default the term filter to the current term once it loads.
  useEffect(() => {
    if (!filterTermCode && currentTerm) setFilterTermCode(currentTerm.code);
  }, [currentTerm, filterTermCode]);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', filterClassId, filterTermCode],
    queryFn: () =>
      listSchedules({
        classId: filterClassId ?? undefined,
        termCode: filterTermCode ?? undefined,
      }),
    enabled: filterTermCode !== null,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['schedules'] });

  const upsertMut = useMutation({
    mutationFn: upsertSchedule,
    onSuccess: () => { message.success('已保存'); setEditorOpen(false); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });
  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => { message.success('已删除'); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '删除失败')),
  });
  const syncMut = useMutation({
    mutationFn: triggerScheduleSync,
    onSuccess: (n: number) => { message.success(`已同步 ${n} 条课表`); refresh(); },
    onError: (e: unknown) => message.error(describeApiError(e, '同步失败')),
  });

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes],
  );

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      class_id: filterClassId ?? '',
      term_code: filterTermCode ?? '',
      entries: JSON.stringify(SAMPLE_ENTRIES, null, 2),
    });
    setEditorOpen(true);
  };

  const openEdit = (s: ClassSchedule) => {
    setEditing(s);
    form.setFieldsValue({
      class_id: s.class_id,
      term_code: s.term_code,
      entries: JSON.stringify(s.entries ?? [], null, 2),
    });
    setEditorOpen(true);
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      // Validate JSON locally so the user gets a clear hint instead of the
      // backend's generic 500 from a Postgres parse error.
      let parsed: ClassScheduleEntry[];
      try {
        parsed = JSON.parse(values.entries);
        if (!Array.isArray(parsed)) throw new Error('entries 必须是数组');
      } catch (e) {
        message.error(`课表 JSON 格式错误：${(e as Error).message}`);
        return;
      }
      upsertMut.mutate({
        class_id: values.class_id,
        term_code: values.term_code,
        source: 'manual',
        entries: JSON.stringify(parsed),
      });
    });
  };

  const columns: ColumnsType<ClassSchedule> = [
    {
      title: '班级',
      dataIndex: 'class_id',
      width: 200,
      render: (id: string) => {
        const c = classMap.get(id);
        return c ? `${c.parent_name ? `${c.parent_name} · ` : ''}${c.name}` : `#${id}`;
      },
    },
    { title: '学期', dataIndex: 'term_code', width: 130 },
    {
      title: '课程数',
      width: 80,
      render: (_, s) => Array.isArray(s.entries) ? s.entries.length : 0,
    },
    { title: '来源', dataIndex: 'source', width: 110, render: (v) => v || '—' },
    {
      title: '最近同步',
      dataIndex: 'last_synced_at',
      width: 150,
      render: (v: string | null) =>
        v ? dayjs(v).format('MM-DD HH:mm') : <Tag color="default">未同步</Tag>,
    },
    {
      title: '操作',
      width: 140,
      render: (_, s) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openEdit(s)}>编辑</Button>
          <Popconfirm title="确认删除该班该学期课表？" onConfirm={() => deleteMut.mutate(s.id)}>
            <Button size="small" type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const classOptions = classes.map((c) => ({
    label: `${c.parent_name ? `${c.parent_name} · ` : ''}${c.name}`,
    value: c.id,
  }));
  const termOptions = terms.map((t) => ({ label: `${t.code} · ${t.name}`, value: t.code }));

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          placeholder="筛选班级"
          options={[{ label: '全部班级', value: '' }, ...classOptions]}
          value={filterClassId ?? ''}
          onChange={(v) => setFilterClassId(v || null)}
          style={{ width: 220 }}
          showSearch
          filterOption={(input, option) =>
            (option?.label as string).toLowerCase().includes(input.toLowerCase())
          }
        />
        <Select
          placeholder="筛选学期"
          options={termOptions}
          value={filterTermCode ?? undefined}
          onChange={(v) => setFilterTermCode(v)}
          style={{ width: 240 }}
        />
        <Button onClick={() => syncMut.mutate()} loading={syncMut.isPending}>
          手动触发同步
        </Button>
        <Button type="primary" onClick={openCreate}>新建 / 编辑课表</Button>
      </Space>

      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={schedules}
        loading={isLoading}
        pagination={false}
      />

      <Drawer
        title={editing ? '编辑班级课表' : '新建班级课表'}
        width={720}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setEditorOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit} loading={upsertMut.isPending}>
              保存
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="JSON 数组结构"
          description={
            <span style={{ fontSize: 12, lineHeight: 1.6 }}>
              每个对象一节课段：<code>course_name</code>、<code>teacher</code>、<code>location</code>、
              <code>day_of_week</code> (1-7)、<code>start_period</code> / <code>end_period</code>（节次）、
              <code>weeks</code>（数组，包含本课段开课的周次）、可选 <code>color</code>。
              保存时按班级 + 学期 upsert，覆盖已有 entries。
            </span>
          }
        />
        <Form form={form} layout="vertical">
          <Form.Item name="class_id" label="班级" rules={[{ required: true }]}>
            <Select
              options={classOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string).toLowerCase().includes(input.toLowerCase())
              }
              disabled={editing !== null}
            />
          </Form.Item>
          <Form.Item name="term_code" label="学期" rules={[{ required: true }]}>
            <Select options={termOptions} disabled={editing !== null} />
          </Form.Item>
          <Form.Item
            name="entries"
            label="课表 entries (JSON 数组)"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={20} style={{ fontFamily: 'var(--font-mono)' }} spellCheck={false} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
