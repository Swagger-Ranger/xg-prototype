// 候选对比 Drawer —— 替代原本的 AskAIChip 「对比卡」AI 文字摘要路径。
//
// 给岗位负责人 / 用工单位 / 学工处快速 triage 候选人的专用面板:
//   - 顶部统计 chip:审批中 / 已录用 / 已拒绝
//   - Segmented 切换看哪类
//   - 卡片式列出申请人(姓名 · 困难等级 · 申请时间 · 自荐说明)
//   - 「审批中」卡片右侧直接录用 / 拒绝(Popconfirm 确认即下推 decide,
//     不要 decision_note 输入框 — 走「申请审批」tab 才需要填理由)
//   - 右上角保留「🤖 AI 总结」入口,让有需要的人可走 AI 拿到自然语言摘要
//
// 数据走 listApplications(positionId=X);后端已加 employer 角色的归属过滤,
// 防止跨单位拿别家候选人 PII(WorkStudyService.listApplicationsScopedToEmployers)。

import { useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Popconfirm,
  Segmented,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '@/utils/antdApp';
import {
  decideApplication,
  listApplications,
  type WorkStudyApplication,
  type WorkStudyPosition,
} from '@/api/workStudy';
import { describeApiError } from '@/utils/api-error';
import { useAskAI } from '@/hooks/useAskAI';

interface Props {
  position: WorkStudyPosition | null;
  onClose: () => void;
  /** 是否给当前用户看到 [录用] / [拒绝] 按钮(无权限的只读看候选)。 */
  canDecide: boolean;
}

/** 困难等级标签;跟 index.tsx 里的 AID_OPTIONS 同源,本组件独立使用一份避免 import 父文件。 */
const AID_LABEL: Record<string, string> = {
  special: '特别困难',
  difficult: '困难',
  mild: '一般困难',
  none: '不困难',
};
const AID_TAG_COLOR: Record<string, string> = {
  special: 'red',
  difficult: 'orange',
  mild: 'gold',
  none: 'default',
};

type Bucket = 'pending' | 'hired' | 'rejected';

export default function ApplicantCompareDrawer({ position, onClose, canDecide }: Props) {
  const open = position !== null;
  const positionId = position?.id ?? null;
  const qc = useQueryClient();
  const askAI = useAskAI();

  const [bucket, setBucket] = useState<Bucket>('pending');

  const appsQ = useQuery({
    queryKey: ['compare-applicants', positionId],
    queryFn: () =>
      listApplications({ page: 1, size: 100, position_id: positionId ?? undefined }),
    enabled: open && positionId !== null,
    staleTime: 10_000,
  });

  const all = appsQ.data?.data ?? [];
  const counts = useMemo(() => {
    const c = { pending: 0, hired: 0, rejected: 0 };
    for (const a of all) {
      if (a.status === 'pending' || a.status === 'recommended') c.pending += 1;
      else if (a.status === 'hired') c.hired += 1;
      else if (a.status === 'rejected') c.rejected += 1;
    }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    if (bucket === 'pending') {
      return all.filter((a) => a.status === 'pending' || a.status === 'recommended');
    }
    return all.filter((a) => a.status === bucket);
  }, [all, bucket]);

  const decideMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'hired' | 'rejected' }) =>
      decideApplication(id, { status }),
    onSuccess: (_d, vars) => {
      message.success(vars.status === 'hired' ? '已录用' : '已拒绝');
      qc.invalidateQueries({ queryKey: ['compare-applicants', positionId] });
      qc.invalidateQueries({ queryKey: ['wsApplications'] });
      qc.invalidateQueries({ queryKey: ['wsPositions'] });
    },
    onError: (e) => message.error(describeApiError(e, '处理失败，请重试')),
  });

  const handleAISummarize = () => {
    if (!position) return;
    askAI({
      ref: {
        type: 'workstudy_position',
        id: String(position.id),
        label: position.title,
        detail: `${position.title}（${position.position_type === 'fixed' ? '固定岗' : '临时岗'}，已招 ${position.hired_count ?? 0}/${position.headcount ?? '?'}）`,
      },
      prompt: `把岗位 #${position.id} 的所有申请整理成候选对比卡，重点提醒值得关注的候选人`,
      autoSend: true,
    });
    onClose();
  };

  return (
    <Drawer
      title={position ? `${position.title} · 候选对比` : '候选对比'}
      open={open}
      onClose={onClose}
      width={640}
      destroyOnHidden
      extra={
        <Tooltip title="把候选数据交给 AI 写一段自然语言摘要 + 推荐">
          <Button size="small" icon={<RobotOutlined />} onClick={handleAISummarize}>
            AI 总结
          </Button>
        </Tooltip>
      }
    >
      {/* 顶部统计 + 切换 */}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={bucket}
          onChange={(v) => setBucket(v as Bucket)}
          options={[
            { label: `审批中 ${counts.pending}`, value: 'pending' },
            { label: `已录用 ${counts.hired}`, value: 'hired' },
            { label: `已拒绝 ${counts.rejected}`, value: 'rejected' },
          ]}
        />
      </div>

      {appsQ.isLoading ? (
        <Spin />
      ) : filtered.length === 0 ? (
        <Empty
          description={
            bucket === 'pending'
              ? '（暂无审批中候选）'
              : bucket === 'hired'
              ? '（暂无已录用候选）'
              : '（暂无已拒绝候选）'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((a) => (
            <ApplicantCard
              key={a.id}
              app={a}
              canDecide={canDecide && (a.status === 'pending' || a.status === 'recommended')}
              decidePending={decideMut.isPending && decideMut.variables?.id === a.id}
              onHire={() => decideMut.mutate({ id: a.id, status: 'hired' })}
              onReject={() => decideMut.mutate({ id: a.id, status: 'rejected' })}
            />
          ))}
        </div>
      )}
    </Drawer>
  );
}

function ApplicantCard({
  app,
  canDecide,
  decidePending,
  onHire,
  onReject,
}: {
  app: WorkStudyApplication;
  canDecide: boolean;
  decidePending: boolean;
  onHire: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const intro = (app.intro || '').trim();
  const introLong = intro.length > 120;
  const aidKey = app.financial_aid_level ?? 'none';

  return (
    <div
      style={{
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r-lg)',
        padding: '12px 14px',
        background: 'var(--bg-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 第一行:姓名 + 困难等级 + 申请时间 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {app.student_name || `#${app.student_id}`}
            </span>
            <Tag color={AID_TAG_COLOR[aidKey] ?? 'default'} style={{ margin: 0 }}>
              {AID_LABEL[aidKey] ?? aidKey}
            </Tag>
            <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {dayjs(app.created_at).format('MM-DD HH:mm')} 提交
            </span>
          </div>
          {/* 自荐说明 */}
          {intro && (
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: 'var(--fg-2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {introLong && !expanded ? intro.slice(0, 120) + '…' : intro}
              {introLong && (
                <button
                  type="button"
                  onClick={() => setExpanded((s) => !s)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ac-hi)',
                    cursor: 'pointer',
                    padding: 0,
                    marginLeft: 4,
                    fontSize: 12,
                  }}
                >
                  {expanded ? '收起' : '展开'}
                </button>
              )}
            </div>
          )}
        </div>
        {/* 决策按钮 — 仅审批中且有权限时显示 */}
        {canDecide && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Popconfirm
              title={`确认录用 ${app.student_name || '该学生'}？`}
              onConfirm={onHire}
              okText="录用"
              cancelText="取消"
            >
              <Button size="small" type="primary" ghost loading={decidePending}>
                录用
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`确认拒绝 ${app.student_name || '该学生'}？`}
              description="如需填写理由请到「申请审批」tab 处理"
              onConfirm={onReject}
              okText="拒绝"
              okButtonProps={{ danger: true }}
              cancelText="取消"
            >
              <Button size="small" danger loading={decidePending}>
                拒绝
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
    </div>
  );
}
