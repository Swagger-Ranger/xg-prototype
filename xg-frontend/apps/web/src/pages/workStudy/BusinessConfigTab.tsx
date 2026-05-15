// 校管理员 · 勤工助学 · 业务配置
//
// 视觉对齐 `pages/leaveConfig/index.tsx` 的 SummaryPanel + LeaveTypeCard 模式:
//   - 顶部一张「全局设置」Card,横排 flex 用竖线分隔,放 1 行能扫完的快速开关
//   - 中部「学年规则({N}) + [+ 新增]」标题行,下面单卡片堆叠,每张 Card 对应一条 year_setting
//   - 底部「审批工作流(3)」标题行,3 张工作流卡,extra 放 [AI 改流程][完整编辑器]
//
// 与请假规则页相比少了:政策建议 Card(workstudy 无国家/校规知识库可引)、askAI 唤起
// 全局 AIPanel(workstudy 用专属 WorkflowAuthorDrawer 内嵌)。
//
// 三阶段时间窗(V114)是 year_setting 的字段,在 YearSettingCard 上读出"今天是否在窗内",
// 同样的字段也在编辑 Modal 里用 RangePicker 改。

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  RobotOutlined,
  QuestionCircleOutlined,
  CalendarOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { message } from '@/utils/antdApp';
import type { WorkflowDefinition } from '@xg1/shared';
import { ROLE_LABELS } from '@xg1/shared';
import {
  listYearSettings,
  upsertYearSetting,
  syncPositionsFromYear,
  type WorkStudyYearSetting,
  type YearSettingUpsert,
} from '@/api/workStudy';
import { listTerms } from '@/api/academic';
import {
  listDefinitions,
  getDefinition,
  updateDefinition,
  publishDefinition,
} from '@/api/workflow';
import { describeApiError } from '@/utils/api-error';
import { functionModuleLabel } from '@/utils/workflow-labels';
import WorkflowAuthorDrawer from '@/pages/workflow/WorkflowAuthorDrawer';
import { parseDsl, serializeDsl, type FlowDsl, type FlowNode } from '@/pages/workflow/dsl';

const WORKSTUDY_BIZ_TYPES = new Set([
  'workstudy_position',
  'workstudy_application',
  'workstudy_salary',
]);

interface YearFormValues {
  academic_year: string;
  max_fixed_per_student: number;
  max_temp_per_student: number;
  application_open: boolean;
  default_allow_self_arrange: boolean;
  position_window?: [Dayjs, Dayjs];
  application_window?: [Dayjs, Dayjs];
  salary_window?: [Dayjs, Dayjs];
}

function toDateRange(start: string | null, end: string | null): [Dayjs, Dayjs] | undefined {
  if (!start && !end) return undefined;
  return [start ? dayjs(start) : dayjs(), end ? dayjs(end) : dayjs()];
}

/** 窗口当前状态文字 — 严格沿用请假规则 Tag 配色克制 (只用 blue/geekblue),状态信息进 Tag 文字。 */
function windowStatusText(start: string | null, end: string | null): string {
  if (!start && !end) return '不限时段';
  const now = dayjs();
  if (start && now.isBefore(start)) return '未开始';
  if (end && now.isAfter(end)) return '已结束';
  return '进行中';
}

export default function BusinessConfigTab() {
  const qc = useQueryClient();

  // ---------- 数据加载 ----------
  const yearQ = useQuery({ queryKey: ['yearSettings'], queryFn: listYearSettings });
  const wfQ = useQuery({
    queryKey: ['workflow-defs-workstudy'],
    queryFn: () => listDefinitions({ page: 1, size: 200 }),
  });
  const termsQ = useQuery({
    queryKey: ['academicTerms'],
    queryFn: listTerms,
    staleTime: 5 * 60_000,
  });

  const yearSettings = yearQ.data ?? [];
  const workflowDefs = (wfQ.data?.data ?? []).filter(
    (d) => d.status === 'published' && d.biz_type && WORKSTUDY_BIZ_TYPES.has(d.biz_type),
  );

  // 学年下拉选项 — 系统基础设置里的学期表(academic_term.code 形如 "2025-2026-1")
  const academicYearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of termsQ.data ?? []) {
      const parts = (t.code ?? '').split('-');
      if (parts.length >= 2 && /^\d{4}$/.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
        set.add(`${parts[0]}-${parts[1]}`);
      }
    }
    return Array.from(set).sort().reverse().map((y) => ({ value: y, label: y }));
  }, [termsQ.data]);

  // "当前学年" = 已配置学年里 academic_year 排序最大的那条 — 全局设置卡片基于它快速操作
  const focusYear = useMemo(() => {
    if (yearSettings.length === 0) return null;
    return [...yearSettings].sort((a, b) => b.academic_year.localeCompare(a.academic_year))[0];
  }, [yearSettings]);

  // ---------- mutations ----------
  const upsertMut = useMutation({
    mutationFn: upsertYearSetting,
    onSuccess: () => {
      message.success('已保存');
      setCreateOpen(false);
      setEditing(null);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['yearSettings'] });
    },
    onError: (e) => message.error(describeApiError(e, '保存失败')),
  });

  const syncMut = useMutation({
    mutationFn: ({ toYear, fromYear }: { toYear: string; fromYear: string }) =>
      syncPositionsFromYear(toYear, fromYear),
    onSuccess: (res) => {
      message.success(`已复制 ${res.copied} 条岗位(${res.fromYear} → ${res.toYear}),新岗位为草稿`);
      setSyncTarget(null);
      syncForm.resetFields();
    },
    onError: (e) => message.error(describeApiError(e, '同步失败')),
  });

  const wfSaveMut = useMutation({
    mutationFn: async ({ id, configYaml }: { id: string; configYaml: string }) => {
      const draft = await updateDefinition(id, { configYaml });
      return await publishDefinition(draft.id);
    },
    onSuccess: () => {
      message.success('已保存并发布,旧版本自动停用');
      qc.invalidateQueries({ queryKey: ['workflow-defs-workstudy'] });
      setAuthoring(null);
    },
    onError: (e) => message.error(describeApiError(e, '保存或发布失败')),
  });

  // ---------- 学年快速开关 ----------
  const quickToggleMut = useMutation({
    mutationFn: (next: { year: string; application_open: boolean }) =>
      upsertYearSetting({ academic_year: next.year, application_open: next.application_open }),
    onSuccess: (saved) => {
      message.success(saved.application_open ? `${saved.academic_year} 招新已开放` : `${saved.academic_year} 招新已关闭`);
      qc.invalidateQueries({ queryKey: ['yearSettings'] });
    },
    onError: (e) => message.error(describeApiError(e, '切换失败')),
  });

  // ---------- 学年 modal state ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WorkStudyYearSetting | null>(null);
  const [form] = Form.useForm<YearFormValues>();
  const [syncTarget, setSyncTarget] = useState<WorkStudyYearSetting | null>(null);
  const [syncForm] = Form.useForm<{ from_year: string }>();

  // ---------- 工作流 AI 编辑 state ----------
  const [authoring, setAuthoring] = useState<{ def: WorkflowDefinition; dsl: FlowDsl } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // chat 小夕深链接预填的指令(Drawer 自动提交一次)。深链接 URL 形如
  // ?tab=business_config&workflow=workstudy_application&prompt=在学生后面加一个辅导员
  const [initialInstruction, setInitialInstruction] = useState<string | undefined>(undefined);
  // URL 参数消费一次后清掉,避免刷新或返回重复触发。
  // 用 fingerprint 而非 boolean — 否则老师第二次从 chat 改同一个 tab 时新指令会被吃掉。
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandledRef = useRef<string | null>(null);

  const openCreateYear = () => {
    setCreateOpen(true);
    form.resetFields();
  };
  const openEditYear = (s: WorkStudyYearSetting) => {
    setEditing(s);
    form.setFieldsValue({
      academic_year: s.academic_year,
      max_fixed_per_student: s.max_fixed_per_student,
      max_temp_per_student: s.max_temp_per_student,
      application_open: s.application_open,
      default_allow_self_arrange: s.default_allow_self_arrange,
      position_window: toDateRange(s.position_window_start, s.position_window_end),
      application_window: toDateRange(s.application_window_start, s.application_window_end),
      salary_window: toDateRange(s.salary_window_start, s.salary_window_end),
    });
  };

  const submitYear = () => {
    form.validateFields().then((v) => {
      const payload: YearSettingUpsert = {
        academic_year: v.academic_year,
        max_fixed_per_student: v.max_fixed_per_student,
        max_temp_per_student: v.max_temp_per_student,
        application_open: v.application_open,
        default_allow_self_arrange: v.default_allow_self_arrange,
        position_window_start: v.position_window?.[0]?.toISOString() ?? null,
        position_window_end: v.position_window?.[1]?.toISOString() ?? null,
        application_window_start: v.application_window?.[0]?.toISOString() ?? null,
        application_window_end: v.application_window?.[1]?.toISOString() ?? null,
        salary_window_start: v.salary_window?.[0]?.toISOString() ?? null,
        salary_window_end: v.salary_window?.[1]?.toISOString() ?? null,
      };
      upsertMut.mutate(payload);
    });
  };

  const openAuthor = async (def: WorkflowDefinition, prefill?: string) => {
    setOpeningId(def.id);
    try {
      const full = await getDefinition(def.id);
      const dsl = parseDsl(full.config_yaml);
      setInitialInstruction(prefill);
      setAuthoring({ def: full, dsl });
    } catch (e) {
      message.error(describeApiError(e, '加载流程定义失败'));
    } finally {
      setOpeningId(null);
    }
  };

  // chat 小夕深链接:收到 ?workflow=XX&prompt=YY 时,等 workflowDefs 加载完后
  // 自动打开对应 Drawer 并预填指令。fingerprint 防止同一对 URL 参数重复消费,
  // 但不同参数对(老师再说一次)能正常再次触发。
  useEffect(() => {
    const wfBiz = searchParams.get('workflow');
    const prompt = searchParams.get('prompt');
    if (!wfBiz || !prompt) return;
    const fingerprint = `${wfBiz}|${prompt}`;
    if (deepLinkHandledRef.current === fingerprint) return;
    if (workflowDefs.length === 0) return; // 等列表加载
    const def = workflowDefs.find((d) => d.biz_type === wfBiz);
    if (!def) {
      message.warning(`未找到工作流 ${wfBiz}`);
      deepLinkHandledRef.current = fingerprint;
      return;
    }
    deepLinkHandledRef.current = fingerprint;
    void openAuthor(def, prompt);
    // 清 URL 上的 workflow / prompt(保留 tab),避免刷新或返回重复触发
    const next = new URLSearchParams(searchParams);
    next.delete('workflow');
    next.delete('prompt');
    setSearchParams(next, { replace: true });
    // openAuthor / setSearchParams 引用稳定,workflowDefs.length 是真正触发的依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowDefs.length, searchParams]);
  const handleWfApply = (newDsl: FlowDsl) => {
    if (!authoring) return;
    const newYaml = serializeDsl(newDsl);
    Modal.confirm({
      title: `应用并发布「${functionModuleLabel(authoring.def)}」的修改？`,
      content: '将创建 v+1 草稿并立即发布,同 code 旧版本自动停用。在途工作流实例锁定快照不受影响。',
      okText: '保存并发布',
      cancelText: '再想想',
      onOk: () => wfSaveMut.mutate({ id: authoring.def.id, configYaml: newYaml }),
    });
  };

  // ---------- 渲染 ----------
  if (yearQ.isLoading || wfQ.isLoading) {
    return (
      <Card style={{ borderRadius: 'var(--r-lg)' }}>
        <Spin />
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        message="勤工助学的学年规则、业务时段、审批工作流统一在这里维护。改动可实时生效;工作流修改会创建新版本并自动停用旧版本(在途实例锁定快照不受影响)。"
        style={{ borderRadius: 'var(--r-lg)' }}
      />

      {/* ─── 全局设置 Card ─── */}
      <Card size="small" style={{ borderRadius: 'var(--r-lg)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
            rowGap: 12,
          }}
        >
          {/* 当前焦点学年 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>当前学年</span>
            {focusYear ? (
              <Tag color="geekblue" style={{ margin: 0 }}>{focusYear.academic_year}</Tag>
            ) : (
              <Tag>未配置</Tag>
            )}
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--bd-3)' }} />

          {/* 招新总开关 — 快速切当前学年 application_open */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>勤工招新</span>
            <Tooltip
              title={
                focusYear
                  ? focusYear.application_open
                    ? '已开放:学生可在小程序提交岗位申请(还需满足上岗时段)。'
                    : '已关闭:学生侧申请按钮置灰,不接受新申请;在岗状态不受影响。'
                  : '请先新增一条学年配置再开启招新。'
              }
            >
              <QuestionCircleOutlined style={{ color: 'var(--fg-3)', cursor: 'help' }} />
            </Tooltip>
            <Switch
              size="small"
              checked={!!focusYear?.application_open}
              loading={quickToggleMut.isPending}
              disabled={!focusYear}
              onChange={(v) =>
                focusYear && quickToggleMut.mutate({ year: focusYear.academic_year, application_open: v })
              }
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--bd-3)' }} />

          {/* 在岗上限速览 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>在岗上限</span>
            {focusYear ? (
              <span style={{ color: 'var(--fg-2)', fontSize: 13 }}>
                固定 {focusYear.max_fixed_per_student} / 临时 {focusYear.max_temp_per_student}
              </span>
            ) : (
              <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>—</span>
            )}
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--bd-3)' }} />

          {/* 三阶段窗口状态速览 — 统一 blue Tag,状态文字在内 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: 'var(--fg-3)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>业务时段</span>
            {focusYear ? (
              <Space size={4}>
                {([
                  ['岗位', focusYear.position_window_start, focusYear.position_window_end],
                  ['申请', focusYear.application_window_start, focusYear.application_window_end],
                  ['薪酬', focusYear.salary_window_start, focusYear.salary_window_end],
                ] as const).map(([label, s, e]) => (
                  <Tag key={label} color="blue" style={{ margin: 0 }}>
                    {label} · {windowStatusText(s, e)}
                  </Tag>
                ))}
              </Space>
            ) : (
              <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>—</span>
            )}
          </div>
        </div>
      </Card>

      {/* ─── 学年规则 区域 ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          学年规则({yearSettings.length})
        </div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={openCreateYear}>
          新增学年
        </Button>
      </div>

      {yearSettings.length === 0 ? (
        <Empty description="(尚未配置任何学年规则)" />
      ) : (
        yearSettings.map((s) => (
          <YearSettingCard
            key={s.id}
            setting={s}
            onEdit={() => openEditYear(s)}
            onSync={() => { setSyncTarget(s); syncForm.resetFields(); }}
          />
        ))
      )}

      {/* ─── 审批工作流 区域 ─── */}
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
        审批工作流({workflowDefs.length})
      </div>

      {workflowDefs.length === 0 ? (
        <Empty description="(未找到勤工助学工作流定义)" />
      ) : (
        workflowDefs.map((def) => (
          <WorkflowDefCard
            key={def.id}
            def={def}
            loading={openingId === def.id}
            onEdit={() => openAuthor(def)}
            onOpenAdvanced={() => window.open('/workflow', '_blank', 'noopener')}
          />
        ))
      )}

      {/* ─── 学年 create/edit Modal ─── */}
      <Modal
        title={editing ? `编辑学年配置 ${editing.academic_year}` : '新增学年配置'}
        open={createOpen || editing !== null}
        onOk={submitYear}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        confirmLoading={upsertMut.isPending}
        width={620}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ max_fixed_per_student: 1, max_temp_per_student: 5 }}
        >
          <Form.Item
            label="学年"
            name="academic_year"
            rules={[
              { required: true, message: '请选择学年' },
              { pattern: /^\d{4}-\d{4}$/, message: '形如 2024-2025' },
            ]}
            extra={
              academicYearOptions.length === 0
                ? '系统基础设置尚未配置学期,先到「系统设置 → 学期」新建后再回来'
                : '来源于「系统设置 → 学期」中已配置的学期'
            }
          >
            {academicYearOptions.length > 0 ? (
              <Select
                placeholder="请选择学年"
                disabled={editing !== null}
                options={academicYearOptions}
                showSearch
              />
            ) : (
              <Input placeholder="2024-2025" disabled={editing !== null} />
            )}
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="学生固定岗在岗上限" name="max_fixed_per_student" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="学生临时岗在岗上限" name="max_temp_per_student" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="开启岗位申请" name="application_open" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item
              label="默认允许单位内部安排"
              name="default_allow_self_arrange"
              valuePropName="checked"
              tooltip="所有用人单位的默认值;可在 employer 上单独覆盖"
              style={{ flex: 1 }}
            >
              <Switch />
            </Form.Item>
          </div>

          <div style={{ fontWeight: 600, fontSize: 13, margin: '8px 0', color: 'var(--fg-2)' }}>
            业务时段(可选,留空 = 该阶段不限时段)
          </div>
          <Form.Item label="岗位设定窗 — 用人单位创建/修改岗位" name="position_window">
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="学生上岗窗 — 学生提交岗位申请" name="application_window">
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="薪酬申报窗 — 用单上报月薪资" name="salary_window">
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── 同步岗位 Modal(沿用原 YearSettingsTab 的功能) ─── */}
      <Modal
        title={syncTarget ? `同步岗位到 ${syncTarget.academic_year}` : '同步'}
        open={syncTarget !== null}
        onOk={() => {
          if (!syncTarget) return;
          syncForm.validateFields().then((v) =>
            syncMut.mutate({ toYear: syncTarget.academic_year, fromYear: v.from_year })
          );
        }}
        onCancel={() => { setSyncTarget(null); syncForm.resetFields(); }}
        confirmLoading={syncMut.isPending}
        okText="开始同步"
      >
        <p style={{ marginBottom: 12, color: 'var(--fg-3)' }}>
          会把指定学年的所有岗位(fixed/temporary)复制到 <strong>{syncTarget?.academic_year}</strong>,
          新岗位 status=draft,hired_count 清零。<strong>不会自动续聘</strong>已在岗学生。
        </p>
        <Form form={syncForm} layout="vertical">
          <Form.Item
            label="来源学年"
            name="from_year"
            rules={[
              { required: true, message: '请输入来源学年' },
              { pattern: /^\d{4}-\d{4}$/, message: '形如 2023-2024' },
            ]}
          >
            <Input placeholder="2023-2024" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── 工作流 AI 编辑 Drawer ─── */}
      {authoring && (
        <WorkflowAuthorDrawer
          open
          onClose={() => {
            setAuthoring(null);
            setInitialInstruction(undefined);
          }}
          currentDsl={authoring.dsl}
          onApply={handleWfApply}
          initialInstruction={initialInstruction}
        />
      )}
    </Space>
  );
}

// =========================================================================
// 子组件:学年规则 Card  (仿 LeaveTypeCard)
// =========================================================================
function YearSettingCard({
  setting,
  onEdit,
  onSync,
}: {
  setting: WorkStudyYearSetting;
  onEdit: () => void;
  onSync: () => void;
}) {
  const enabled = setting.application_open;
  return (
    <Card
      size="small"
      style={{ borderRadius: 'var(--r-lg)', opacity: enabled ? 1 : 0.85 }}
      title={
        <span style={{ fontWeight: 600 }}>
          {setting.academic_year} 学年
          {!enabled && (
            <Tag color="default" style={{ marginLeft: 8, fontWeight: 400 }}>
              招新未开放
            </Tag>
          )}
          {setting.default_allow_self_arrange && (
            <Tag color="default" style={{ marginLeft: 8, fontWeight: 400 }}>
              默认单位内部安排
            </Tag>
          )}
        </span>
      }
      extra={
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={onSync}>
            复制岗位
          </Button>
        </Space>
      }
    >
      {/* 学年规则是"配置读取"语义,跟工作流的"档位→角色 chain"语义不同,所以这里
          故意采用 键 / 值 二列布局(不要 Tag 不要箭头),视觉上拉开和审批工作流卡的距离。 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '88px 1fr',
          rowGap: 6,
          columnGap: 16,
          fontSize: 13,
        }}
      >
        <span style={{ color: 'var(--fg-3)' }}>在岗上限</span>
        <span style={{ color: 'var(--fg-1)' }}>
          固定 <strong>{setting.max_fixed_per_student}</strong> / 学生
          <span style={{ color: 'var(--fg-3)', margin: '0 8px' }}>·</span>
          临时 <strong>{setting.max_temp_per_student}</strong> / 学生
        </span>

        {([
          ['岗位设定窗', setting.position_window_start, setting.position_window_end],
          ['学生上岗窗', setting.application_window_start, setting.application_window_end],
          ['薪酬申报窗', setting.salary_window_start, setting.salary_window_end],
        ] as const).map(([label, start, end]) => {
          const hasWindow = !!(start || end);
          return (
            <Fragment key={label}>
              <span style={{ color: 'var(--fg-3)' }}>{label}</span>
              <span>
                {hasWindow ? (
                  <>
                    <span style={{ color: 'var(--fg-1)' }}>
                      {start ? dayjs(start).format('MM-DD HH:mm') : '不限起'}
                      <span style={{ color: 'var(--fg-3)' }}> ~ </span>
                      {end ? dayjs(end).format('MM-DD HH:mm') : '不限止'}
                    </span>
                    <span style={{ color: 'var(--fg-3)', margin: '0 8px' }}>·</span>
                    <span style={{ color: 'var(--fg-2)' }}>{windowStatusText(start, end)}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--fg-3)' }}>不限时段</span>
                )}
              </span>
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}

// =========================================================================
// 子组件:审批工作流 Card
//
// body 渲染规则:
//   - 线性链(workstudy 当前 3 个工作流都是)→ 一行,只放 blue 角色 Tag,用 → 分隔
//     第一个 Tag 是 form_submit 的发起人,后续是 approval 节点的审批角色
//   - 含 condition 分支(预留兼容)→ 每分支一行,前面带分支 display_label 的 geekblue Tag
//     (这种情况下 leave 那套"档位 → 角色"模型才有意义)
// =========================================================================
interface ApprovalLine {
  /** null = 线性链(整行直接平铺角色);非 null = 条件分支(左侧 geekblue 显示分档名)。 */
  label: string | null;
  roles: string[];
}

// 勤工助学工作流 form_submit 节点的 name 是描述句(如"用工单位负责人发布"),
// 这里按已知前缀匹配作为发起人 Tag 内容;识别不到就 fallback 到整句话。
// **按字符长度倒序排列**:确保"用工单位负责人"在"用工单位"之前命中,不会被短前缀误抢。
const KNOWN_INITIATOR_PREFIXES = [
  '用工单位负责人',
  '用人单位领导',
  '资助中心人员',
  '学工处人员',
  '岗位负责人',
  '用工单位',
  '辅导员',
  '班主任',
  '学生',
].sort((a, b) => b.length - a.length);

function initiatorFromFormSubmitName(name: string | undefined): string {
  if (!name) return '发起人';
  for (const p of KNOWN_INITIATOR_PREFIXES) {
    if (name.startsWith(p)) return p;
  }
  return name;
}

// 勤工助学工作流里的 2 个虚拟角色 — 不在 sys_role 表也不在 shared RoleCode 枚举里,
// 后端运行时按业务字段解析到具体用户:
//   - employer_leader  : 按 employer.leader_user_id 解析
//   - position_owner   : 按 work_study_position.owner_user_id 解析
// (aid_center_officer 已是真实 RBAC 角色,中文名走 shared ROLE_LABELS,不在此处兜底)
const WORKSTUDY_EXTRA_ROLE_LABEL: Record<string, string> = {
  employer_leader: '用人单位领导',
  position_owner: '岗位负责人',
};

/** 从 DSL 抽出审批链(每行 = 一条从 start 走到 end 的角色序列)。 */
function extractApprovalLines(dsl: FlowDsl): ApprovalLine[] {
  const map = new Map<string, FlowNode>(dsl.nodes.map((n) => [n.id, n]));
  const lines: ApprovalLine[] = [];
  const roleZh = (code: string) =>
    WORKSTUDY_EXTRA_ROLE_LABEL[code] ??
    ROLE_LABELS[code as keyof typeof ROLE_LABELS] ??
    code;

  // 从 startId 起向后走,带着已累计的 roles 和当前行的 label(null=线性链)。
  // 遇到 condition 节点 = 当前行分裂为 N 条,每条用分支 display_label 作 label 继续。
  function walk(startId: string, label: string | null, acc: string[]) {
    const seen = new Set<string>();
    let id = startId;
    const roles = [...acc];
    while (id && !seen.has(id)) {
      seen.add(id);
      const node = map.get(id);
      if (!node || node.type === 'end') break;
      if (node.type === 'form_submit') {
        // 发起人作为链条第 1 个 Tag(从 name 抽出角色名)
        roles.push(initiatorFromFormSubmitName(node.name));
        id = node.next;
      } else if (node.type === 'approval') {
        roles.push(roleZh(node.assignee.role));
        id = node.next;
      } else if (node.type === 'condition') {
        for (const br of node.branches) {
          const brLabel =
            br.display_label ?? (br.when === 'default' ? '默认' : br.when.slice(0, 14));
          walk(br.next, brLabel, roles);
        }
        return;
      } else if (node.type === 'notification' || node.type === 'publicity') {
        id = node.next;
      } else {
        break;
      }
    }
    if (roles.length > 0) lines.push({ label, roles });
  }

  walk(dsl.start, null, []);
  return lines;
}

function WorkflowDefCard({
  def,
  loading,
  onEdit,
  onOpenAdvanced,
}: {
  def: WorkflowDefinition;
  loading: boolean;
  onEdit: () => void;
  onOpenAdvanced: () => void;
}) {
  // DSL 解析失败 = 流程定义不规范,体现为 body 空 + 一个友好提示;不阻断卡片渲染。
  const lines = useMemo<ApprovalLine[]>(() => {
    try {
      return extractApprovalLines(parseDsl(def.config_yaml));
    } catch {
      return [];
    }
  }, [def.config_yaml]);

  // 卡片在勤工助学的业务配置 tab 里,"勤工助学 · "前缀冗余,本地 strip 掉
  // 只保留功能名(岗位申请 / 学生申请 / 薪资申请)。其他页面(如 /workflow 管理页)
  // 仍走全名 — 那里上下文不限定模块,需要前缀消歧。
  const title = functionModuleLabel(def).replace(/^勤工助学\s*·\s*/, '');

  return (
    <Card
      size="small"
      style={{ borderRadius: 'var(--r-lg)' }}
      title={<span style={{ fontWeight: 600 }}>{title}</span>}
      extra={
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<RobotOutlined />}
            loading={loading}
            onClick={onEdit}
          >
            AI 改流程
          </Button>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={onOpenAdvanced}>
            完整编辑器
          </Button>
        </Space>
      }
    >
      {lines.length === 0 ? (
        <span style={{ color: 'var(--fg-3)' }}>(无审批节点)</span>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {lines.map((ln, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* 条件分支才有左侧 geekblue 档位标签;线性链(workstudy 主用)直接平铺角色 */}
              {ln.label !== null && (
                <>
                  <Tag color="geekblue" style={{ minWidth: 80, textAlign: 'center', margin: 0 }}>
                    {ln.label}
                  </Tag>
                  <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>→</span>
                </>
              )}
              {ln.roles.map((r, j) => (
                <Fragment key={j}>
                  {j > 0 && (
                    <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>→</span>
                  )}
                  <Tag color="blue" style={{ margin: 0 }}>{r}</Tag>
                </Fragment>
              ))}
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}
