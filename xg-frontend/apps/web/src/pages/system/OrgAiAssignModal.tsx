import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Empty,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ThunderboltFilled,
  CheckCircleFilled,
  WarningFilled,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type AiLeaderScope,
  type AiLeaderSuggestion,
  type AssignableUser,
  type OrgTreeNode,
  aiSuggestLeaders,
  batchApplyLeaders,
} from '@/api/orgAssignment';
import { describeApiError } from '@/utils/api-error';

/**
 * AI 派班 Modal：按 scope 一次性生成"班级 → 推荐班主任"建议表，用户审核 / 改人 /
 * 勾选后一次事务批量应用。仅处理班主任补缺（leader_id IS NULL 的班）。
 *
 * 设计要点：
 * - 算法在后端走 Java 规则（按当前 leadership 升序），不调 LLM
 * - 用户改 Select 后保留覆盖；checkbox 默认勾上"有候选"的行
 * - 应用后 invalidate org.tree + leaveConfig.health（后者让审批引擎拿到新人员）
 */

interface Props {
  open: boolean;
  onClose: () => void;
  tree: OrgTreeNode[];
  classMasters: AssignableUser[];
}

interface RowState {
  leaderId: string | null;
  checked: boolean;
}

export default function OrgAiAssignModal({ open, onClose, tree, classMasters }: Props) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<AiLeaderScope>('missing_leader_global');
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiLeaderSuggestion[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [hasGenerated, setHasGenerated] = useState(false);

  const colleges = useMemo(() => tree.filter((n) => n.type === 'college'), [tree]);
  const classMasterOptions = useMemo(
    () =>
      classMasters.map((u) => ({
        label: `${u.real_name}（${u.username}）`,
        value: u.id,
      })),
    [classMasters],
  );

  // 关闭后重置内部状态，下次打开是干净的。
  useEffect(() => {
    if (!open) {
      setScope('missing_leader_global');
      setCollegeId(null);
      setSuggestions([]);
      setRowState({});
      setHasGenerated(false);
    }
  }, [open]);

  function resetGenerated() {
    setHasGenerated(false);
    setSuggestions([]);
    setRowState({});
  }

  const suggestMut = useMutation({
    mutationFn: () =>
      aiSuggestLeaders({
        scope,
        collegeId: scope === 'missing_leader_college' ? (collegeId ?? undefined) : undefined,
      }),
    onSuccess: (data) => {
      setSuggestions(data);
      const initial: Record<string, RowState> = {};
      for (const s of data) {
        initial[s.class_id] = {
          leaderId: s.recommended_leader_id,
          checked: s.recommended_leader_id != null,
        };
      }
      setRowState(initial);
      setHasGenerated(true);
    },
    onError: (e) => message.error(describeApiError(e, '生成推荐失败')),
  });

  const applyMut = useMutation({
    mutationFn: () => {
      const items = suggestions
        .map((s) => {
          const st = rowState[s.class_id];
          if (!st || !st.checked || st.leaderId == null) return null;
          return { classId: s.class_id, leaderId: st.leaderId };
        })
        .filter((x): x is { classId: string; leaderId: string } => x != null);
      return batchApplyLeaders(items);
    },
    onSuccess: () => {
      message.success('已应用');
      queryClient.invalidateQueries({ queryKey: ['org.tree'] });
      // 派班结果可能消除"审批链卡死"健康警告 —— 跟单条 endpoint 行为对齐。
      queryClient.invalidateQueries({ queryKey: ['leaveConfig.health'] });
      onClose();
    },
    onError: (e) => message.error(describeApiError(e, '批量应用失败')),
  });

  const stats = useMemo(() => {
    const total = suggestions.length;
    let withCandidate = 0;
    let noCandidate = 0;
    let checked = 0;
    for (const s of suggestions) {
      const st = rowState[s.class_id];
      if (s.recommended_leader_id != null) withCandidate += 1;
      else noCandidate += 1;
      if (st?.checked && st.leaderId != null) checked += 1;
    }
    return { total, withCandidate, noCandidate, checked };
  }, [suggestions, rowState]);

  const toggleAll = (checked: boolean) => {
    setRowState((prev) => {
      const next: Record<string, RowState> = {};
      for (const s of suggestions) {
        const st = prev[s.class_id];
        const leaderId = st?.leaderId ?? null;
        next[s.class_id] = {
          leaderId,
          checked: checked && leaderId != null,
        };
      }
      return next;
    });
  };

  const allChecked =
    stats.withCandidate > 0 && stats.checked === stats.withCandidate;
  const someChecked = stats.checked > 0 && stats.checked < stats.withCandidate;

  const canGenerate = scope === 'missing_leader_global' || collegeId != null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltFilled style={{ color: '#faad14', fontSize: 18 }} />
          <span>AI 派班建议</span>
          <span style={{ fontSize: 13, color: 'var(--fg-3)', fontWeight: 'normal' }}>
            · 班主任补缺
          </span>
        </span>
      }
      width={920}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            <InfoCircleOutlined style={{ marginRight: 4 }} />
            批量应用为单事务，任一失败整体回滚
          </span>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Badge
              count={stats.checked}
              offset={[-4, 4]}
              color={stats.checked > 0 ? '#faad14' : '#d9d9d9'}
            >
              <Button
                type="primary"
                size="middle"
                disabled={stats.checked === 0}
                loading={applyMut.isPending}
                onClick={() => applyMut.mutate()}
              >
                应用所选
              </Button>
            </Badge>
          </Space>
        </div>
      }
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size={14}>
        {/* 范围选择条 */}
        <div
          style={{
            background: 'var(--bg-2, #fafafa)',
            border: '1px solid var(--border-1, #f0f0f0)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--fg-2, #595959)', fontWeight: 500 }}>
            派班范围
          </span>
          <Radio.Group
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              resetGenerated();
            }}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="missing_leader_global">全校缺班主任的班</Radio.Button>
            <Radio.Button value="missing_leader_college">选定学院</Radio.Button>
          </Radio.Group>

          {scope === 'missing_leader_college' && (
            <Select
              style={{ minWidth: 220 }}
              placeholder="选择学院"
              value={collegeId ?? undefined}
              onChange={(v) => {
                setCollegeId(v);
                resetGenerated();
              }}
              options={colleges.map((c) => ({ label: c.name, value: c.id }))}
              showSearch
              optionFilterProp="label"
              allowClear
              onClear={() => setCollegeId(null)}
            />
          )}

          <div style={{ flex: 1 }} />

          <Button
            type={hasGenerated ? 'default' : 'primary'}
            icon={<ThunderboltFilled />}
            disabled={!canGenerate}
            loading={suggestMut.isPending}
            onClick={() => suggestMut.mutate()}
          >
            {hasGenerated ? '重新生成' : '生成 AI 推荐'}
          </Button>
        </div>

        {/* 总览条 */}
        {hasGenerated && stats.total > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 20,
              padding: '10px 14px',
              background: 'linear-gradient(90deg, #fffbe6 0%, #fff 100%)',
              border: '1px solid #ffe58f',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <StatChip
              label="缺班主任"
              value={stats.total}
              color="#262626"
              icon={<WarningFilled style={{ color: '#fa8c16' }} />}
            />
            <StatChip
              label="AI 已推荐"
              value={stats.withCandidate}
              color="#389e0d"
              icon={<CheckCircleFilled style={{ color: '#52c41a' }} />}
            />
            {stats.noCandidate > 0 && (
              <StatChip
                label="无可派人选"
                value={stats.noCandidate}
                color="#cf1322"
                icon={<WarningFilled style={{ color: '#ff4d4f' }} />}
              />
            )}
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--fg-3)' }}>
              已勾选应用 <b style={{ color: '#faad14' }}>{stats.checked}</b> /{' '}
              {stats.withCandidate}
            </span>
          </div>
        )}

        {/* 结果区 */}
        {hasGenerated && stats.total === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: 'var(--fg-3)' }}>
                该范围下没有缺班主任的班级 🎉
              </span>
            }
            style={{ padding: '32px 0' }}
          />
        ) : suggestions.length > 0 ? (
          <Table
            size="middle"
            rowKey="class_id"
            pagination={false}
            scroll={{ y: 380 }}
            dataSource={suggestions}
            rowClassName={(row) =>
              row.recommended_leader_id == null ? 'ai-row-empty' : 'ai-row-default'
            }
            columns={[
              {
                title: (
                  <Checkbox
                    checked={allChecked}
                    indeterminate={someChecked}
                    disabled={stats.withCandidate === 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                ),
                key: 'check',
                width: 50,
                render: (_, row) => {
                  const st = rowState[row.class_id];
                  const noCandidate = row.recommended_leader_id == null;
                  return (
                    <Checkbox
                      disabled={noCandidate || st?.leaderId == null}
                      checked={!!st?.checked}
                      onChange={(e) =>
                        setRowState((prev) => ({
                          ...prev,
                          [row.class_id]: {
                            leaderId: prev[row.class_id]?.leaderId ?? null,
                            checked: e.target.checked,
                          },
                        }))
                      }
                    />
                  );
                },
              },
              {
                title: '班级',
                dataIndex: 'class_name',
                key: 'class_name',
                width: 180,
                render: (v: string) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>🏫</span>
                    <span style={{ fontWeight: 500 }}>{v}</span>
                  </span>
                ),
              },
              {
                title: '班主任',
                key: 'leader',
                render: (_, row) => {
                  const st = rowState[row.class_id];
                  const noCandidate = row.recommended_leader_id == null;
                  const isRecommended =
                    st?.leaderId != null && st.leaderId === row.recommended_leader_id;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Select
                        style={{ flex: 1, minWidth: 200 }}
                        placeholder={noCandidate ? '无可派人选' : '选择班主任'}
                        value={st?.leaderId ?? undefined}
                        options={classMasterOptions}
                        disabled={noCandidate && classMasterOptions.length === 0}
                        onChange={(v) =>
                          setRowState((prev) => ({
                            ...prev,
                            [row.class_id]: {
                              leaderId: v ?? null,
                              checked: v != null,
                            },
                          }))
                        }
                        showSearch
                        optionFilterProp="label"
                        allowClear
                      />
                      {isRecommended && (
                        <Tooltip title="AI 推荐保持不变">
                          <Tag
                            color="gold"
                            style={{ margin: 0, padding: '0 6px', fontSize: 11 }}
                          >
                            <ThunderboltFilled style={{ marginRight: 2 }} />
                            AI
                          </Tag>
                        </Tooltip>
                      )}
                    </div>
                  );
                },
              },
              {
                title: '理由',
                dataIndex: 'reason',
                key: 'reason',
                render: (v: string, row) => (
                  <span
                    style={{
                      color:
                        row.recommended_leader_id == null
                          ? '#cf1322'
                          : 'var(--fg-3, #8c8c8c)',
                      fontSize: 13,
                    }}
                  >
                    {v}
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <div
            style={{
              padding: '40px 0',
              textAlign: 'center',
              color: 'var(--fg-3)',
              fontSize: 13,
            }}
          >
            选择派班范围后点「生成 AI 推荐」查看建议
          </div>
        )}
      </Space>

      {/* 行级背景：AI 推荐行金色淡底，无候选行灰底 */}
      <style>{`
        .ai-row-default > td {
          background: rgba(255, 248, 224, 0.4) !important;
        }
        .ai-row-default:hover > td {
          background: rgba(255, 248, 224, 0.7) !important;
        }
        .ai-row-empty > td {
          background: rgba(0, 0, 0, 0.02) !important;
          opacity: 0.7;
        }
      `}</style>
    </Modal>
  );
}

function StatChip({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      <span style={{ color: 'var(--fg-3)' }}>{label}</span>
      <b style={{ color, fontSize: 15 }}>{value}</b>
    </span>
  );
}
