import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, InputNumber, Space, Spin, Switch, Tabs, Tag, Tooltip } from 'antd';
import { message } from '@/utils/antdApp';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTermMaxDays } from '@/api/leave';
import { describeApiError } from '@/utils/api-error';
import {
  ToolOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type ConfigSummary, getConfigSummary } from '@/api/workflowConfig';
import {
  getLeaveTypes,
  getLeaveImpactConfig,
  updateLeaveImpactConfig,
} from '@/api/leave';
import { useLayoutStore } from '@/stores/layout.store';
import { useAIActionStore } from '@/stores/ai-action.store';
import LeaveReturnSettings from './LeaveReturnSettings';
import styles from './index.module.css';
import type { LeaveTypeConfig } from '@xg1/shared';

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
  const activeTab: 'leave' | 'leave_return' =
    searchParams.get('tab') === 'leave_return' ? 'leave_return' : 'leave';
  const setActiveTab = (k: 'leave' | 'leave_return') => {
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
        onChange={(k) => setActiveTab(k as 'leave' | 'leave_return')}
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

  // 拉假别字典(含 term_max_days)— 跟 markdown 通过中文 name 关联,显示 +
  // inline 编辑学期累计上限。markdown 还是从 workflow YAML 渲染,跟
  // leave_type_config 解耦;这里只做 visual 注入 + 调 PUT API 写表。
  const qc = useQueryClient();
  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 60 * 1000,
    enabled: bizType === 'leave',
  });
  const typeByName = useMemo(() => {
    const map = new Map<string, LeaveTypeConfig>();
    for (const t of leaveTypes) if (t.name) map.set(t.name, t);
    return map;
  }, [leaveTypes]);

  const saveTermCapMutation = useMutation({
    mutationFn: ({ code, days }: { code: string; days: number | null }) =>
      updateTermMaxDays(code, days),
    onSuccess: (_, variables) => {
      message.success(
        variables.days == null
          ? '已设为不限'
          : `学期上限已保存为 ${variables.days} 天`,
      );
      qc.invalidateQueries({ queryKey: ['leaveTypes'] });
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败,请重试')),
  });

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
      {bizType === 'leave' && (
        <Card size="small" style={{ borderRadius: 'var(--r-lg)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '4px 4px',
              flexWrap: 'wrap',
            }}
          >
            <Switch
              checked={impactEnabled}
              loading={impactToggleMutation.isPending}
              onChange={(v) => impactToggleMutation.mutate(v)}
              checkedChildren="开"
              unCheckedChildren="关"
            />
            <span style={{ fontWeight: 600, fontSize: 14 }}>请假影响课程</span>
            {impactEnabled ? (
              <Tag color="success" style={{ margin: 0 }}>已打开</Tag>
            ) : (
              <Tag style={{ margin: 0 }}>已关闭</Tag>
            )}
            <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {impactEnabled
                ? '学生填表时会看到该时段缺的课程数;辅导员审批 drawer 也会显示。'
                : '已隐藏:学生填表 / 辅导员审批 / 学生详情都不再显示影响课程。'}
            </span>
          </div>
        </Card>
      )}

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
        {parsed.formFields.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>
              学生提交时需填字段
            </div>
            <Space size={8} wrap>
              {parsed.formFields.map((f) => (
                <Tag
                  key={f.label}
                  color={f.required ? 'orange' : 'default'}
                  style={{ margin: 0 }}
                >
                  {f.label}
                  {f.required ? ' *' : ''}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          假别 + 审批链({parsed.types.length})
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
        parsed.types.map((t) => {
          const cfg = typeByName.get(t.name);
          return (
            <LeaveTypeCard
              key={t.name}
              typeInfo={t}
              bizType={bizType}
              askAI={askAI}
              code={cfg?.code}
              termMaxDays={cfg?.term_max_days ?? null}
              onSaveTermCap={
                cfg
                  ? (days) =>
                      saveTermCapMutation.mutateAsync({ code: cfg.code, days })
                  : undefined
              }
              saving={saveTermCapMutation.isPending}
            />
          );
        })
      )}
    </Space>
  );
}

function LeaveTypeCard({
  typeInfo,
  bizType,
  askAI,
  code,
  termMaxDays,
  onSaveTermCap,
  saving,
}: {
  typeInfo: ParsedLeaveType;
  bizType: 'leave' | 'leave_return';
  askAI: (prompt: string) => void;
  code?: string;
  termMaxDays?: number | null;
  onSaveTermCap?: (days: number | null) => Promise<unknown>;
  saving?: boolean;
}) {
  const isLeave = bizType === 'leave';

  // inline 编辑状态:服务器值 → 本地 draft
  const [unlimited, setUnlimited] = useState(termMaxDays == null);
  const [draftDays, setDraftDays] = useState<number | null>(termMaxDays ?? 5);
  useEffect(() => {
    setUnlimited(termMaxDays == null);
    setDraftDays(termMaxDays ?? 5);
  }, [termMaxDays]);

  const targetDays = unlimited ? null : draftDays;
  const dirty =
    targetDays !== (termMaxDays ?? null) &&
    (unlimited || (typeof draftDays === 'number' && draftDays > 0));

  const onSaveClick = async () => {
    if (!onSaveTermCap || !dirty || saving) return;
    if (!unlimited && (draftDays == null || draftDays <= 0)) {
      message.warning('请输入大于 0 的天数,或切到「不限」');
      return;
    }
    try {
      await onSaveTermCap(unlimited ? null : (draftDays as number));
    } catch {
      // mutation 已 onError 提示
    }
  };
  return (
    <Card
      size="small"
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
      {isLeave && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px dashed var(--border-1, #eee)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--fg-2)', minWidth: 92 }}>本学期累计上限</span>

          {code ? (
            <>
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
                  min={0.5}
                  max={365}
                  step={0.5}
                  precision={1}
                  value={draftDays ?? undefined}
                  onChange={(v) => setDraftDays(typeof v === 'number' ? v : null)}
                  style={{ width: 96 }}
                  addonAfter="天"
                />
              )}

              {dirty ? (
                <Button
                  size="small"
                  type="primary"
                  loading={saving}
                  onClick={onSaveClick}
                >
                  保存
                </Button>
              ) : (
                <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                  {termMaxDays != null ? `已生效:${termMaxDays} 天` : '当前不限'}
                </span>
              )}
            </>
          ) : (
            // 边缘情况:markdown 解析出来的假别名跟 leave_type_config 表对不上
            // (一般是 AI 新建假别但 sync 没追上)。给个降级的灰提示 + AI 入口。
            <>
              <Tag>未关联</Tag>
              <Button
                size="small"
                type="link"
                onClick={() =>
                  askAI(`帮我把"${typeInfo.name}"的本学期累计上限设成 N 天`)
                }
              >
                通过 AI 助手配置
              </Button>
            </>
          )}
        </div>
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
