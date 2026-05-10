import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, InputNumber, Space, Spin, Switch, Tabs, Tag, Tooltip } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeApiError } from '@/utils/api-error';
import {
  ToolOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type ConfigSummary, getConfigSummary } from '@/api/workflowConfig';
import {
  getLeaveImpactConfig,
  updateLeaveImpactConfig,
  getLeaveGlobalConfig,
  updateLeaveGlobalConfig,
  updateLeaveRequireProof,
  getLeaveTypes,
  type LeaveGlobalConfig,
} from '@/api/leave';
import type { LeaveTypeConfig } from '@xg1/shared';
import { useLayoutStore } from '@/stores/layout.store';
import { useAIActionStore } from '@/stores/ai-action.store';
import LeaveReturnSettings from './LeaveReturnSettings';
import LeaveNoticeSettings from './LeaveNoticeSettings';
import PolicyHintsBanner from './PolicyHintsBanner';
import ConfigHistoryDrawer from './ConfigHistoryDrawer';
import styles from './index.module.css';

/**
 * 「请销假配置」简化版页面(A.1 P0)。
 *
 * 设计原则:
 *  - 老师只看中文规则摘要,不看 YAML / 节点 / 表达式 / 任何技术词
 *  - 修改路径**只有一个**:右下角全局 AI 助手(本页面提供入口按钮唤起)
 *  - 高级用户(工程/运维)需要直改 YAML 时,「高级模式」跳到「工作流定义」页
 *
 * 改动入口分两类:
 *  - 假别 Card 上的「编辑」「删除」按钮 → 唤起 AI 助手 + 预填指令
 *  - 顶部「+ 新增假别」按钮 → 唤起 AI 助手 + 引导式 prompt
 */
export default function LeaveConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  type TabKey = 'leave' | 'leave_return' | 'notice';
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey =
    tabParam === 'leave_return' ? 'leave_return' : tabParam === 'notice' ? 'notice' : 'leave';
  const setActiveTab = (k: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (k === 'leave') next.delete('tab');
    else next.set('tab', k);
    setSearchParams(next, { replace: true });
  };
  const setAiPanelOpen = useLayoutStore((s) => s.setAiPanelOpen);
  const seedAiInput = useAIActionStore((s) => s.seedInput);
  const navigate = useNavigate();

  /** 唤起 AI 助手并预填指令(不自动发送,老师可调整后再发)。 */
  const askAI = (prompt: string) => {
    setAiPanelOpen(true);
    seedAiInput(prompt);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>请销假配置</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title="直接编辑 YAML 流程定义,适合工程师">
            <Button icon={<ToolOutlined />} onClick={() => navigate('/workflows')}>
              高级模式
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className={styles.subtitle}>
        当前规则的中文版。点假别上的「编辑/删除」或下面「新增假别」会唤起 AI 助手,告诉它你想怎么改即可。
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
        items={[
          {
            key: 'leave',
            label: '请假',
            children: <SummaryPanel bizType="leave" askAI={askAI} />,
          },
          {
            key: 'leave_return',
            label: '销假',
            children: <LeaveReturnSettings />,
          },
          {
            key: 'notice',
            label: '请假须知',
            children: <LeaveNoticeSettings />,
          },
        ]}
      />
    </div>
  );
}

function SummaryPanel({
  bizType,
  askAI,
}: {
  bizType: 'leave' | 'leave_return';
  askAI: (prompt: string) => void;
}) {
  const { data, isLoading, error } = useQuery<ConfigSummary>({
    queryKey: ['workflow-config.summary', bizType],
    queryFn: () => getConfigSummary(bizType),
    staleTime: 30 * 1000,
  });

  const qc = useQueryClient();

  // 假别字典:中文 name → code 反查,只为 LeaveTypeCard 加 DOM 锚点(AI 提案命中卡时滚动 + 高亮)
  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 60 * 1000,
    enabled: bizType === 'leave',
  });
  const codeByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of leaveTypes) if (t.name && t.code) m.set(t.name, t.code);
    return m;
  }, [leaveTypes]);

  // 「请假影响课程」全局开关。关闭后学生填表 / 辅导员审批 drawer / mini 端
  // detail 页都拿到 zero 视图自动隐藏。
  const { data: impactConfig } = useQuery<{ enabled: boolean }>({
    queryKey: ['leaveImpactConfig'],
    queryFn: getLeaveImpactConfig,
    enabled: bizType === 'leave',
    staleTime: 60 * 1000,
  });
  const impactToggleMutation = useMutation({
    mutationFn: updateLeaveImpactConfig,
    onSuccess: (saved) => {
      message.success(saved.enabled ? '已开启「请假影响课程」' : '已关闭「请假影响课程」');
      qc.setQueryData(['leaveImpactConfig'], saved);
      qc.invalidateQueries({ queryKey: ['leave.impact.preview'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败,请重试')),
  });
  const impactEnabled = impactConfig?.enabled ?? true;

  // 解析中文 markdown 摘要为结构化数据,前端按 Card 渲染。
  const parsed = useMemo(() => parseSummaryMd(data?.summary_md ?? ''), [data?.summary_md]);

  if (isLoading) {
    return (
      <Card style={{ borderRadius: 'var(--r-lg)' }}>
        <Spin />
      </Card>
    );
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="加载配置失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }
  if (!data || data.version == null) {
    return <Empty description={`${bizType === 'leave' ? '请假' : '销假'} 还没发布过配置`} />;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {bizType === 'leave' && <PolicyHintsBanner />}

      {bizType === 'leave' && (
        <Card
          size="small"
          style={{ borderRadius: 'var(--r-lg)' }}
          title={
            <span>
              {data.name}
              <Tag color="blue" style={{ marginLeft: 8 }}>
                v{data.version}
              </Tag>
            </span>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexWrap: 'wrap',
              rowGap: 12,
            }}
          >
            {/* 影响课程开关 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>请假影响课程</span>
              <Tooltip
                title={
                  impactEnabled
                    ? '学生填表时会看到该时段缺的课程数;辅导员审批 drawer 也会显示。'
                    : '已隐藏:学生填表 / 辅导员审批 / 学生详情都不再显示影响课程。'
                }
              >
                <QuestionCircleOutlined style={{ color: 'var(--fg-3)', cursor: 'help' }} />
              </Tooltip>
              <Switch
                size="small"
                checked={impactEnabled}
                loading={impactToggleMutation.isPending}
                onChange={(v) => impactToggleMutation.mutate(v)}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--bd-3)' }} />

            {/* 全学期累计上限(说明在 ? 图标上) */}
            <GlobalTermCapCard bare />

            <div style={{ width: 1, height: 24, background: 'var(--bd-3)' }} />

            {/* 学生填写区域:V098 起只暴露「证明材料」一个全局开关。
                旧的 form fields(目的地 / 紧急联系人等)是工作流 form schema 字段,
                由 AI 助手通过工作流配置改,不再在请假规则页平铺展示。 */}
            <RequireProofToggle />
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          请假配置({parsed.types.length})
        </div>
        {bizType === 'leave' && (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() =>
              askAI(
                '新增一个假别,我需要补充以下信息:① 名称 ② 上限多少天 ③ 由哪些角色审批(分几档)。',
              )
            }
          >
            新增假别
          </Button>
        )}
      </div>

      {parsed.types.length === 0 ? (
        <Empty description="（未解析到假别)" />
      ) : (
        parsed.types.map((t) => (
          <LeaveTypeCard
            key={t.name}
            typeInfo={t}
            bizType={bizType}
            askAI={askAI}
            code={codeByName.get(t.name)}
          />
        ))
      )}
    </Space>
  );
}

/**
 * 全学期累计上限(替代原 per-假别 term_max_days)。
 *
 * 行为:学生申请页 / 辅导员审批 drawer 都会拉本学期累计天数,**超过这里设的
 * 总数时只做软警告**(不阻断提交),并把这条状态喂给 PendingTaskEnricher 作为
 * 高风险触发条件。null = 不限,UI 全部隐藏。
 */
function GlobalTermCapCard({ bare = false }: { bare?: boolean } = {}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LeaveGlobalConfig>({
    queryKey: ['leaveGlobalConfig'],
    queryFn: getLeaveGlobalConfig,
    staleTime: 60 * 1000,
  });
  // term_max_days 后端虽然是 NUMERIC,前端只让填整数 — 半天颗粒度由 duration_days
  // 一侧负责,这里强制取整避免「累计 7.5 天 vs 上限 8 天」这种半天残值带来的歧义。
  const serverDays = data?.term_max_days != null ? Math.round(data.term_max_days) : null;
  const [unlimited, setUnlimited] = useState(serverDays == null);
  const [draft, setDraft] = useState<number | null>(serverDays ?? 15);
  useEffect(() => {
    setUnlimited(serverDays == null);
    setDraft(serverDays ?? 15);
  }, [serverDays]);

  const saveMutation = useMutation({
    mutationFn: (days: number | null) => updateLeaveGlobalConfig(days),
    onSuccess: (saved) => {
      message.success(
        saved.term_max_days == null
          ? '已设为不限'
          : `全学期累计上限已保存为 ${saved.term_max_days} 天`,
      );
      qc.setQueryData(['leaveGlobalConfig'], saved);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败,请重试')),
  });

  const target = unlimited ? null : draft;
  const dirty =
    target !== serverDays && (unlimited || (typeof draft === 'number' && draft > 0));

  const inner = isLoading ? (
    <Spin />
  ) : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: bare ? 0 : '4px 4px',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 14 }}>全学期累计上限</span>
      <Tooltip title="学生本学期所有假别累计超过这个总数时:学生申请页和辅导员审批页都会显示软警告,并被自动标记为高风险,不会阻断提交。">
        <QuestionCircleOutlined style={{ color: 'var(--fg-3)', cursor: 'help' }} />
      </Tooltip>
      <Switch
        size="small"
        checked={!unlimited}
        onChange={(v) => setUnlimited(!v)}
        checkedChildren="限"
        unCheckedChildren="不限"
      />
      {unlimited ? (
        <Tag style={{ margin: 0 }}>不限</Tag>
      ) : (
        <InputNumber
          size="small"
          min={1}
          max={365}
          step={1}
          precision={0}
          value={draft ?? undefined}
          onChange={(v) => setDraft(typeof v === 'number' ? Math.round(v) : null)}
          style={{ width: 96 }}
          addonAfter="天"
        />
      )}
      {dirty ? (
        <Button
          size="small"
          type="primary"
          loading={saveMutation.isPending}
          onClick={() => {
            if (!unlimited && (draft == null || draft <= 0 || !Number.isInteger(draft))) {
              message.warning('请输入大于 0 的整数天数,或切到「不限」');
              return;
            }
            saveMutation.mutate(unlimited ? null : (draft as number));
          }}
        >
          保存
        </Button>
      ) : (
        <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
          {serverDays != null ? `已生效:${serverDays} 天` : '当前不限'}
        </span>
      )}
    </div>
  );
  if (bare) return inner;
  return (
    <Card size="small" style={{ borderRadius: 'var(--r-lg)' }}>
      {inner}
    </Card>
  );
}

/**
 * 「证明材料」全局开关。开 = 学生提交请假表单时必须上传证明文件;关 = 不强制(默认)。
 * 后端落表 leave_global_config.require_proof,前端开关绑这一列。
 * 学生提交端的「实际生效」逻辑(根据这个开关决定 LeaveApplyModal 是否加 file 字段)
 * 由后续迭代接入,本组件只负责配置位的读写。
 */
function RequireProofToggle() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LeaveGlobalConfig>({
    queryKey: ['leaveGlobalConfig'],
    queryFn: getLeaveGlobalConfig,
    staleTime: 60 * 1000,
  });
  const checked = !!data?.require_proof;
  const mutation = useMutation({
    mutationFn: updateLeaveRequireProof,
    onSuccess: (saved) => {
      qc.setQueryData(['leaveGlobalConfig'], saved);
      message.success(saved.require_proof ? '已开启「证明材料」要求' : '已关闭「证明材料」要求');
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败,请重试')),
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>证明材料</span>
      <Tooltip title="开启后,学生提交请假表单时必须上传证明文件;关闭则不强制(默认关)。">
        <QuestionCircleOutlined style={{ color: 'var(--fg-3)', cursor: 'help' }} />
      </Tooltip>
      <Switch
        size="small"
        checked={checked}
        loading={isLoading || mutation.isPending}
        onChange={(v) => mutation.mutate(v)}
        checkedChildren="必传"
        unCheckedChildren="可选"
      />
    </div>
  );
}

function LeaveTypeCard({
  typeInfo,
  bizType,
  askAI,
  code,
}: {
  typeInfo: ParsedLeaveType;
  bizType: 'leave' | 'leave_return';
  askAI: (prompt: string) => void;
  /** 假别 code,用于 AI 提案命中卡时滚动 + 高亮锚点 #leave-type-{code} */
  code?: string;
}) {
  const isLeave = bizType === 'leave';
  return (
    <Card
      size="small"
      id={code ? `leave-type-${code}` : undefined}
      style={{ borderRadius: 'var(--r-lg)' }}
      title={<span style={{ fontWeight: 600 }}>{typeInfo.name}</span>}
      extra={
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() =>
              askAI(`修改"${typeInfo.name}"——`)
            }
          >
            编辑
          </Button>
          {isLeave && (
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => askAI(`停用"${typeInfo.name}"假别`)}
            >
              停用
            </Button>
          )}
        </Space>
      }
    >
      {typeInfo.segments.length === 0 ? (
        <span style={{ color: 'var(--fg-3)' }}>(无审批节点)</span>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {typeInfo.segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="geekblue" style={{ minWidth: 80, textAlign: 'center', margin: 0 }}>
                {seg.range}
              </Tag>
              <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>→</span>
              <Space size={4}>
                {seg.roles.map((r, j) => (
                  <Tag key={j} color="blue" style={{ margin: 0 }}>
                    {r}
                  </Tag>
                ))}
              </Space>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}

// ----- helpers -----

interface ParsedSummary {
  formFields: { label: string; required: boolean }[];
  types: ParsedLeaveType[];
}

interface ParsedLeaveType {
  name: string;
  segments: { range: string; roles: string[] }[];
}

/**
 * 把后端中文 markdown 摘要解析为结构化数据。markdown 形态固定:
 *
 *   ### 学生提交时需填字段
 *   - 目的地（必填）
 *   - 紧急联系人
 *
 *   ### 假别 + 审批链
 *   **事假**
 *   - 0-2 天:班主任
 *   - 2-4 天:班主任 → 辅导员
 *
 * 跟 LeaveConfigSummaryService.renderMarkdown() 强耦合 — 后端格式变前端解析也要跟着调。
 */
function parseSummaryMd(md: string): ParsedSummary {
  const formFields: ParsedSummary['formFields'] = [];
  const types: ParsedLeaveType[] = [];
  if (!md) return { formFields, types };

  const lines = md.split('\n');
  let mode: 'none' | 'fields' | 'types' = 'none';
  let currentType: ParsedLeaveType | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('### ')) {
      const heading = line.slice(4).trim();
      if (heading.includes('字段')) mode = 'fields';
      else if (heading.includes('假别') || heading.includes('审批')) mode = 'types';
      else mode = 'none';
      continue;
    }

    if (mode === 'fields' && line.startsWith('-')) {
      const text = line.replace(/^-\s*/, '').trim();
      const required = text.includes('（必填）') || text.includes('(必填)');
      const label = text.replace(/（必填）|\(必填\)/g, '').trim();
      formFields.push({ label, required });
      continue;
    }

    if (mode === 'types') {
      // **事假** 或 **婚假**
      const bold = line.match(/^\*\*(.+)\*\*$/);
      if (bold) {
        if (currentType) types.push(currentType);
        currentType = { name: bold[1].trim(), segments: [] };
        continue;
      }
      // - 0-2 天:班主任 → 辅导员 → 院系书记
      if (line.startsWith('-') && currentType) {
        const text = line.replace(/^-\s*/, '').trim();
        const colonIdx = text.indexOf('：');
        if (colonIdx < 0) continue;
        const range = text.slice(0, colonIdx).trim();
        const rolesStr = text.slice(colonIdx + 1).trim();
        const roles = rolesStr
          .split(/\s*→\s*/)
          .map((r) => r.trim())
          .filter(Boolean);
        currentType.segments.push({ range, roles });
      }
    }
  }
  if (currentType) types.push(currentType);
  return { formFields, types };
}

/**
 * 不含 Tabs / page header 的「请假规则」面板,供 LeaveAppPage 当作一个 tab 嵌入。
 * 内部仍然只渲染 leave 分支的 SummaryPanel(销假/请假须知由外层兄弟 tab 负责)。
 */
export function LeaveRulesPanel() {
  const setAiPanelOpen = useLayoutStore((s) => s.setAiPanelOpen);
  const seedAiInput = useAIActionStore((s) => s.seedInput);
  const navigate = useNavigate();
  const askAI = (prompt: string) => {
    setAiPanelOpen(true);
    seedAiInput(prompt);
  };

  // ?focus={code} 触发滚动 + 高亮:AI 助手「看一下事假配置」会 navigate 到带这个参数的 URL,
  // SummaryPanel 渲染完卡片后,这里 setTimeout 找锚点滚到屏幕中央 + 加闪烁 class,然后清掉
  // 参数避免下次刷新或回退又触发。
  const [searchParams, setSearchParams] = useSearchParams();
  const focusCode = searchParams.get('focus');
  useEffect(() => {
    if (!focusCode) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`leave-type-${focusCode}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('ai-focus-flash');
        void el.offsetWidth;
        el.classList.add('ai-focus-flash');
        setTimeout(() => el.classList.remove('ai-focus-flash'), 2100);
      }
      // 清掉 focus 参数,保留 tab=rule
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
    // 仅依赖 focusCode — searchParams/setSearchParams 是 router hook 引用稳定,不参与依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCode]);

  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>
          点假别上的「编辑/停用」或「新增假别」会唤起 AI 助手,告诉它你想怎么改即可。
        </span>
        <Button
          size="small"
          icon={<HistoryOutlined />}
          onClick={() => setHistoryOpen(true)}
        >
          历史版本
        </Button>
      </div>
      <SummaryPanel bizType="leave" askAI={askAI} />
      <ConfigHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        bizType="leave"
      />
    </div>
  );
}
